import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { BackupDeletionRequestSchema } from "@axes/contracts";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import {
  BACKUP_OPTIONS,
  BACKUP_STORE,
  BackupService,
  type BackupOptions,
} from "./backup.service";
import type { BackupStore } from "./backup-store";

@Injectable()
export class BackupDeletionService {
  private readonly logger = new Logger(BackupDeletionService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BACKUP_STORE) private readonly store: BackupStore | null,
    @Inject(BackupService) private readonly backups: BackupService,
    @Inject(BACKUP_OPTIONS) private readonly options: BackupOptions
  ) {}

  private async authorize(
    tx: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal
  ) {
    if (
      principal.authMethod !== "session" ||
      !principal.sessionId ||
      principal.isSuperuser !== true
    ) {
      throw new ForbiddenException();
    }
    // Recheck after acquiring the maintenance lock, including revocations that
    // committed while this request was waiting. No client-supplied privileges.
    const [membership, session] = await Promise.all([
      tx.organizationMembership.findFirst({
        where: {
          id: principal.membershipId,
          organizationId: principal.organizationId,
          userId: principal.userId,
          isActive: true,
          isSuperuser: true,
          organization: { isActive: true },
          user: { isActive: true },
        },
        select: { id: true },
      }),
      tx.refreshSession.findFirst({
        where: {
          id: principal.sessionId,
          organizationId: principal.organizationId,
          userId: principal.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    if (!membership || !session) throw new ForbiddenException();
  }

  async requestDeletion(
    principal: AuthenticatedPrincipal,
    id: string,
    body: unknown,
    requestId: string
  ) {
    if (!this.store)
      throw new ServiceUnavailableException(
        "Armazenamento de backups não configurado."
      );
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        id
      )
    ) {
      throw new BadRequestException("Identificador de backup inválido.");
    }
    id = id.toLowerCase();
    const input = BackupDeletionRequestSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException(
        "Confirme a exclusão do backup selecionado."
      );

    return this.prisma.withMaintenance(
      principal.organizationId,
      async tx => {
        await this.authorize(tx, principal);
        const row = await tx.backupRecord.findFirst({
          where: { id, organizationId: principal.organizationId },
        });
        if (!row) throw new NotFoundException("Backup não encontrado.");
        if (row.checksum !== input.data.checksum)
          throw new BadRequestException(
            "O backup selecionado mudou. Atualize o histórico."
          );
        if (row.state === "DELETING" || row.state === "DELETED")
          return { id, state: row.state };
        if (row.state !== "COMPLETED")
          throw new ConflictException(
            "Somente backups concluídos podem ser excluídos."
          );

        const newest = await tx.backupRecord.findFirst({
          where: {
            organizationId: principal.organizationId,
            state: "COMPLETED",
          },
          orderBy: [
            { completedAt: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          select: { id: true },
        });
        if (newest?.id === id)
          throw new ConflictException(
            "O backup concluído mais recente está protegido. Crie uma nova cópia antes de excluí-lo."
          );
        // COMPLETED records prove a past verification, not current readability.
        // Keep the selected copy if its replacement is now missing or corrupt.
        try {
          if (!newest) throw new Error("NO_REPLACEMENT_BACKUP");
          await this.backups.verify(principal.organizationId, newest.id);
        } catch {
          throw new ConflictException(
            "Não foi possível verificar a cópia mais recente. Crie um novo backup antes de excluir esta cópia."
          );
        }
        const active = await tx.dataOperation.count({
          where: {
            organizationId: principal.organizationId,
            state: { in: ["PENDING", "RUNNING"] },
          },
        });
        const previews = await tx.operationPreview.count({
          where: {
            organizationId: principal.organizationId,
            targetBackupId: id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (active || previews)
          throw new ConflictException(
            "Há uma operação ou prévia de restauração em andamento. Aguarde sua conclusão ou expiração."
          );

        await tx.backupRecord.update({
          where: {
            id_organizationId: { id, organizationId: principal.organizationId },
          },
          data: { state: "DELETING", errorCode: null },
        });
        await tx.auditLog.create({
          data: {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            requestId: requestId || randomUUID(),
            action: "backup.deletion_requested",
            entityType: "backup",
            entityId: id,
            metadata: { backupId: id, checksum: row.checksum },
          },
        });
        return { id, state: "DELETING" };
      },
      { timeout: this.options.snapshotTimeoutMs }
    );
  }

  async reconcile(): Promise<number> {
    if (!this.store) return 0;
    const store = this.store;
    // Include disabled tenants: a committed deletion must still finish if an
    // administrator disables the organization before the next worker cycle.
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    let removed = 0;
    for (const organization of organizations) {
      const rows = await this.prisma.withTenant(organization.id, tx =>
        tx.backupRecord.findMany({
          where: { organizationId: organization.id, state: "DELETING" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 20,
          select: { id: true },
        })
      );
      for (const { id } of rows) {
        try {
          const completed = await this.prisma.withMaintenance(
            organization.id,
            async tx => {
              const row = await tx.backupRecord.findFirst({
                where: {
                  id,
                  organizationId: organization.id,
                  state: "DELETING",
                },
              });
              if (!row) return false;
              // Unlink is idempotent. If audit/commit fails after unlink, the
              // durable DELETING row survives and the next cycle retries it.
              await store.remove(id);
              await tx.auditLog.create({
                data: {
                  organizationId: organization.id,
                  actorUserId: null,
                  requestId: id,
                  action: "backup.deleted",
                  entityType: "backup",
                  entityId: id,
                  metadata: { backupId: id },
                },
              });
              await tx.backupRecord.update({
                where: {
                  id_organizationId: { id, organizationId: organization.id },
                },
                data: { state: "DELETED", errorCode: null },
              });
              return true;
            }
          );
          if (completed) removed++;
        } catch {
          this.logger.warn(`Backup deletion will retry: ${id}`);
          await this.prisma
            .withTenant(organization.id, tx =>
              tx.backupRecord.updateMany({
                where: {
                  id,
                  organizationId: organization.id,
                  state: "DELETING",
                },
                data: { errorCode: "BACKUP_DELETE_RETRY" },
              })
            )
            .catch(() => undefined);
        }
      }
    }
    return removed;
  }
}
