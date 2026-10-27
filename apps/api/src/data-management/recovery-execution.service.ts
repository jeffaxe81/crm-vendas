import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  DeleteExecutionRequestSchema,
  OperationPreviewSchema,
  RestoreExecutionRequestSchema,
} from "@axes/contracts";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import {
  BACKUP_OPTIONS,
  BACKUP_STORE,
  BackupService,
  type BackupOptions,
} from "./backup.service";
import {
  BACKUP_ENVELOPE_OVERHEAD_BYTES,
  type BackupStore,
} from "./backup-store";
import { decodeSnapshot } from "./backup-manifest";
import {
  lockBackupStorage,
  reserveBackupStorage,
  releaseBackupStorage,
} from "./backup-storage-capacity";
import { deletionSnapshot } from "./recovery-deletion-preflight";
import { executeConfirmedRestoreLocked } from "./restore-transaction";
import { executeConfirmedDeletionLocked } from "./delete-transaction";
import {
  DELETE_CONFIRMATION_PHRASE,
  RESTORE_CONFIRMATION_PHRASE,
  type RestoreConfirmation,
} from "./restore-confirmation";

export const RECOVERY_OPTIONS = Symbol("RECOVERY_OPTIONS");
export type RecoveryOptions = { enabled: boolean };
type RecoveryKind = "RESTORE" | "DELETE";

@Injectable()
export class RecoveryExecutionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BackupService) private readonly backups: BackupService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(BACKUP_STORE) private readonly store: BackupStore | null,
    @Inject(BACKUP_OPTIONS) private readonly backupOptions: BackupOptions,
    @Inject(RECOVERY_OPTIONS) private readonly options: RecoveryOptions
  ) {}

  capabilities() {
    return {
      enabled: this.options.enabled,
      configured: !!this.store,
      confirmationPhrases: {
        restore: RESTORE_CONFIRMATION_PHRASE,
        delete: DELETE_CONFIRMATION_PHRASE,
      },
      maxPreviewAgeSeconds: 300,
    };
  }

  private enabled() {
    if (!this.options.enabled)
      throw new ServiceUnavailableException(
        "Execução de recuperação desativada até homologação."
      );
    if (!this.store)
      throw new ServiceUnavailableException(
        "Armazenamento de backups não configurado."
      );
  }

  private async authorize(
    tx: Prisma.TransactionClient,
    p: AuthenticatedPrincipal
  ) {
    if (p.authMethod !== "session" || p.isSuperuser !== true || !p.sessionId)
      throw new ForbiddenException();
    const [membership, session, user] = await Promise.all([
      tx.organizationMembership.findFirst({
        where: {
          id: p.membershipId,
          organizationId: p.organizationId,
          userId: p.userId,
          isActive: true,
          isSuperuser: true,
          organization: { isActive: true },
          user: { isActive: true },
        },
        select: { id: true },
      }),
      tx.refreshSession.findFirst({
        where: {
          id: p.sessionId,
          organizationId: p.organizationId,
          userId: p.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
      tx.user.findFirst({
        where: { id: p.userId, isActive: true },
        select: { passwordHash: true },
      }),
    ]);
    if (!membership || !session || !user) throw new ForbiddenException();
    return user;
  }

  async previewDeletion(p: AuthenticatedPrincipal) {
    this.enabled();
    const row = await this.prisma.withTenant(
      p.organizationId,
      async tx => {
        await this.authorize(tx, p);
        const snapshot = await deletionSnapshot(
          tx,
          p.organizationId,
          this.backupOptions.maxBytes
        );
        const created = await tx.operationPreview.create({
          data: {
            organizationId: p.organizationId,
            actorUserId: p.userId,
            sessionId: p.sessionId,
            kind: "DELETE",
            currentFingerprint: snapshot.currentFingerprint,
            expiresAt: new Date(Date.now() + 300000),
            payload: {
              currentCounts: snapshot.currentCounts,
              targetCounts: snapshot.targetCounts,
              targetFingerprint: snapshot.targetFingerprint,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: p.organizationId,
            actorUserId: p.userId,
            requestId: created.id,
            action: "delete.preview_created",
            entityType: "operation_preview",
            entityId: created.id,
            metadata: {
              currentCounts: snapshot.currentCounts,
              targetCounts: snapshot.targetCounts,
              expiresAt: created.expiresAt.toISOString(),
            },
          },
        });
        return { row: created, ...snapshot };
      },
      {
        isolationLevel: "RepeatableRead",
        timeout: this.backupOptions.snapshotTimeoutMs,
      }
    );
    return OperationPreviewSchema.parse({
      id: row.row.id,
      organizationId: row.row.organizationId,
      actorUserId: row.row.actorUserId,
      kind: row.row.kind,
      targetBackupId: null,
      targetChecksum: null,
      currentFingerprint: row.row.currentFingerprint,
      targetSchemaVersion: null,
      targetByteCount: null,
      targetCounts: row.targetCounts,
      currentCounts: row.currentCounts,
      unsupportedRestoreModels: [],
      createdAt: row.row.createdAt.toISOString(),
      expiresAt: row.row.expiresAt.toISOString(),
    });
  }

  private async verifyConfirmationAttempt(
    p: AuthenticatedPrincipal,
    input: RestoreConfirmation
  ) {
    const user = await this.prisma.withTenant(p.organizationId, async tx => {
      const current = await this.authorize(tx, p);
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
        `tenant-maintenance:${p.organizationId}`
      );
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        `recovery-attempt:${p.organizationId}:${p.userId}`
      );
      const [attempt] = await tx.$queryRaw<{ attempts: number }[]>`
        INSERT INTO public.recovery_confirmation_attempts (organization_id,user_id,attempts)
        VALUES (${p.organizationId}::uuid,${p.userId}::uuid,1)
        ON CONFLICT (organization_id,user_id) DO UPDATE SET
          attempts=CASE WHEN recovery_confirmation_attempts.window_started_at < clock_timestamp()-interval '15 minutes' THEN 1 ELSE LEAST(recovery_confirmation_attempts.attempts+1,6) END,
          window_started_at=CASE WHEN recovery_confirmation_attempts.window_started_at < clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE recovery_confirmation_attempts.window_started_at END
        RETURNING attempts`;
      return { ...current, attempts: attempt!.attempts };
    });
    if (user.attempts > 5)
      throw new HttpException(
        "Limite de confirmações atingido. Aguarde antes de tentar novamente.",
        429
      );
    if (
      !(await this.passwords
        .verify(user.passwordHash, input.password)
        .catch(() => false))
    )
      throw new BadRequestException("Confirmação inválida ou expirada.");
  }

  private async begin(
    p: AuthenticatedPrincipal,
    kind: RecoveryKind,
    input: RestoreConfirmation
  ) {
    return this.prisma.withTenant(p.organizationId, async tx => {
      await this.authorize(tx, p);
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
        `tenant-maintenance:${p.organizationId}`
      );
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        `data-operation:${p.organizationId}`
      );
      const preview = await tx.operationPreview.findFirst({
        where: {
          id: input.previewId,
          organizationId: p.organizationId,
          actorUserId: p.userId,
          sessionId: p.sessionId,
          kind,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!preview)
        throw new BadRequestException("Confirmação inválida ou expirada.");
      const previous = await tx.dataOperation.findFirst({
        where: { id: preview.id, organizationId: p.organizationId },
      });
      if (previous?.state === "COMPLETED")
        throw new ConflictException(
          "Esta operação já foi concluída. Consulte o histórico."
        );
      const active = await tx.dataOperation.count({
        where: {
          organizationId: p.organizationId,
          state: "RUNNING",
          leaseUntil: { gt: new Date() },
        },
      });
      if (active)
        throw new ConflictException(
          "Já existe uma operação em andamento nesta empresa."
        );
      if (
        previous &&
        (previous.kind !== kind || previous.actorUserId !== p.userId)
      )
        throw new ForbiddenException();
      const workerId = `http-recovery:${randomUUID()}`;
      const values = {
        actorUserId: p.userId,
        kind,
        state: "RUNNING",
        stage: "CONFIRMED",
        workerId,
        leaseUntil: new Date(
          Date.now() + 2 * this.backupOptions.snapshotTimeoutMs + 30000
        ),
        payload: {
          previewId: preview.id,
          sessionId: p.sessionId,
          targetBackupId: preview.targetBackupId,
        },
        checkpoint: {},
        preventiveBackupId: null,
        errorCode: null,
        completedAt: null,
      };
      const operation = await tx.dataOperation.upsert({
        where: { id: preview.id },
        create: {
          id: preview.id,
          organizationId: p.organizationId,
          ...values,
          attempts: 1,
        },
        update: { ...values, attempts: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: p.organizationId,
          actorUserId: p.userId,
          requestId: operation.id,
          action: `${kind.toLowerCase()}.execution_requested`,
          entityType: "data_operation",
          entityId: operation.id,
          metadata: {
            previewId: preview.id,
            targetBackupId: preview.targetBackupId,
            attempt: operation.attempts,
          },
        },
      });
      return { operation, preview };
    });
  }

  private async reservePreventive(
    p: AuthenticatedPrincipal,
    id: string,
    kind: RecoveryKind
  ) {
    await this.prisma.withTenant(p.organizationId, async tx => {
      await this.authorize(tx, p);
      await lockBackupStorage(tx, p.organizationId);
      const existing = await tx.backupRecord.findFirst({
        where: { id, organizationId: p.organizationId },
      });
      const reason = kind === "RESTORE" ? "PRE_RESTORE" : "PRE_DELETE";
      if (
        existing &&
        (existing.actorUserId !== p.userId || existing.reason !== reason)
      )
        throw new BackupError("RESTORE_PREVENTIVE_NOT_AUTHORIZED");
      if (existing?.state === "COMPLETED") return;
      if (!existing)
        await tx.backupRecord.create({
          data: {
            id,
            organizationId: p.organizationId,
            actorUserId: p.userId,
            reason,
            state: "PENDING",
          },
        });
      await reserveBackupStorage(
        tx,
        p.organizationId,
        id,
        BigInt(this.backupOptions.maxBytes + BACKUP_ENVELOPE_OVERHEAD_BYTES)
      );
    });
  }

  private receipt(row: {
    id: string;
    kind: string;
    createdAt: Date;
    completedAt: Date | null;
    preventiveBackupId: string | null;
    payload: unknown;
  }) {
    const payload =
      row.payload &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      kind: row.kind,
      state: "COMPLETED" as const,
      preventiveBackupId: row.preventiveBackupId,
      targetBackupId:
        typeof payload.targetBackupId === "string"
          ? payload.targetBackupId
          : null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  async execute(p: AuthenticatedPrincipal, kind: RecoveryKind, body: unknown) {
    this.enabled();
    const parsed = (
      kind === "RESTORE"
        ? RestoreExecutionRequestSchema
        : DeleteExecutionRequestSchema
    ).safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        "Informe prévia, senha vigente e a frase de confirmação exata."
      );
    await this.verifyConfirmationAttempt(p, parsed.data);
    const { operation, preview } = await this.begin(p, kind, parsed.data);
    try {
      const target =
        kind === "RESTORE"
          ? await this.backups.verify(p.organizationId, preview.targetBackupId!)
          : null;
      await this.reservePreventive(p, operation.id, kind);
      return await this.prisma.withMaintenance(
        p.organizationId,
        async tx => {
          const fence = {
            operationId: operation.id,
            workerId: operation.workerId!,
            attempts: operation.attempts,
          };
          if (kind === "RESTORE")
            await executeConfirmedRestoreLocked(
              tx,
              p,
              parsed.data,
              fence,
              target!,
              this.passwords,
              this.store!,
              this.backupOptions.maxBytes
            );
          else
            await executeConfirmedDeletionLocked(
              tx,
              p,
              parsed.data,
              fence,
              this.passwords,
              this.store!,
              this.backupOptions.maxBytes
            );
          await releaseBackupStorage(tx, p.organizationId, operation.id);
          return this.receipt(
            await tx.dataOperation.findUniqueOrThrow({
              where: { id: operation.id },
            })
          );
        },
        {
          isolationLevel: "RepeatableRead",
          timeout: this.backupOptions.snapshotTimeoutMs,
        }
      );
    } catch (error) {
      const result = await this.prisma
        .withTenant(p.organizationId, async tx => {
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
            `tenant-maintenance:${p.organizationId}`
          );
          const current = await tx.dataOperation.findFirst({
            where: { id: operation.id, organizationId: p.organizationId },
          });
          if (current?.state === "COMPLETED") return current;
          const code =
            error instanceof BackupError
              ? error.code
              : "RECOVERY_EXECUTION_UNCONFIRMED";
          const failed = await tx.dataOperation.updateMany({
            where: {
              id: operation.id,
              organizationId: p.organizationId,
              state: "RUNNING",
              workerId: operation.workerId,
              attempts: operation.attempts,
            },
            data: {
              state: "FAILED",
              stage: "FAILED",
              errorCode: code,
              completedAt: new Date(),
              leaseUntil: null,
            },
          });
          if (failed.count !== 1) {
            const latest = await tx.dataOperation.findFirst({
              where: { id: operation.id, organizationId: p.organizationId },
            });
            return latest?.state === "COMPLETED" ? latest : null;
          }
          await tx.auditLog.create({
            data: {
              organizationId: p.organizationId,
              actorUserId: p.userId,
              requestId: operation.id,
              action: `${kind.toLowerCase()}.execution_failed`,
              entityType: "data_operation",
              entityId: operation.id,
              metadata: { errorCode: code, attempt: operation.attempts },
            },
          });
          return null;
        })
        .catch(() => null);
      if (result) return this.receipt(result);
      await this.recoverPreventive(p.organizationId, operation.id).catch(
        () => {}
      );
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException
      )
        throw error;
      if (
        error instanceof BackupError &&
        [
          "RESTORE_PREVIEW_STALE",
          "RESTORE_CONFIRMATION_INVALID",
          "RESTORE_PRESERVED_REFERENCE_MISSING",
          "RESTORE_POLICY_UNSUPPORTED",
          "BACKUP_QUOTA_EXCEEDED",
        ].includes(error.code)
      )
        throw new ConflictException(error.code);
      throw new ServiceUnavailableException(
        "Não foi possível confirmar o resultado. Consulte o histórico antes de tentar novamente."
      );
    }
  }

  /** An interrupted request may leave a safety copy; adopt bytes, never replay business mutations. */
  async recoverPreventive(organizationId: string, id: string) {
    if (!this.store) return;
    let bytes: Buffer;
    try {
      bytes = await this.store.read(id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // A possibly-still-running publisher may appear later. Keep reservation on uncertainty.
      return;
    }
    const verified = decodeSnapshot(
      bytes,
      organizationId,
      this.backupOptions.maxBytes
    );
    await this.prisma.withTenant(organizationId, async tx => {
      await lockBackupStorage(tx, organizationId);
      const row = await tx.backupRecord.findFirst({
        where: {
          id,
          organizationId,
          state: { in: ["PENDING", "RUNNING", "FAILED"] },
          reason: { in: ["PRE_RESTORE", "PRE_DELETE"] },
        },
      });
      if (!row) return;
      const operation = await tx.dataOperation.findFirst({
        where: { id, organizationId, kind: { in: ["RESTORE", "DELETE"] } },
      });
      if (
        !operation ||
        (operation.state === "RUNNING" &&
          operation.leaseUntil &&
          operation.leaseUntil > new Date())
      )
        return;
      await tx.backupRecord.update({
        where: { id_organizationId: { id, organizationId } },
        data: {
          state: "COMPLETED",
          byteCount: BigInt(bytes.length),
          schemaVersion: verified.manifest.schemaVersion,
          checksum: verified.manifest.checksum,
          counts: verified.manifest.counts,
          completedAt: new Date(),
          errorCode: null,
        },
      });
      await releaseBackupStorage(tx, organizationId, id);
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: row.actorUserId,
          requestId: id,
          action: "recovery.preventive_copy_recovered",
          entityType: "backup",
          entityId: id,
          metadata: { operationId: id },
        },
      });
    });
  }

  async operations(p: AuthenticatedPrincipal) {
    const rows = await this.prisma.withTenant(p.organizationId, async tx => {
      await this.authorize(tx, p);
      return tx.dataOperation.findMany({
        where: {
          organizationId: p.organizationId,
          kind: { in: ["RESTORE", "DELETE"] },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
    });
    for (const row of rows) {
      if (
        row.state === "RUNNING" &&
        row.leaseUntil &&
        row.leaseUntil <= new Date()
      ) {
        await this.prisma.withTenant(p.organizationId, async tx => {
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
            `tenant-maintenance:${p.organizationId}`
          );
          return tx.dataOperation.updateMany({
            where: {
              id: row.id,
              state: "RUNNING",
              leaseUntil: { lte: new Date() },
            },
            data: {
              state: "FAILED",
              stage: "INTERRUPTED",
              errorCode: "RECOVERY_INTERRUPTED",
              completedAt: new Date(),
            },
          });
        });
        await this.recoverPreventive(p.organizationId, row.id).catch(() => {});
      }
    }
    return this.prisma.withTenant(p.organizationId, async tx =>
      (
        await tx.dataOperation.findMany({
          where: {
            organizationId: p.organizationId,
            kind: { in: ["RESTORE", "DELETE"] },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      ).map(row => ({
        ...this.receipt(row),
        state: row.state,
        stage: row.stage,
        errorCode: row.errorCode,
      }))
    );
  }
}
