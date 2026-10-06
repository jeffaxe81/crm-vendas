import { Inject, Injectable } from "@nestjs/common";
import {
  OperationPreviewSchema,
  type OperationPreview,
} from "@axes/contracts";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { BackupError } from "./backup-error";
import {
  snapshotDataFingerprint,
  type SnapshotData,
} from "./backup-manifest";
import {
  BACKUP_OPTIONS,
  BackupService,
  type BackupOptions,
} from "./backup.service";
import { exportTenantSnapshot } from "./tenant-snapshot";

export const OPERATION_PREVIEW_TTL_MS = 5 * 60 * 1000;

function snapshotCounts(data: SnapshotData): Record<string, number> {
  return Object.fromEntries(
    Object.entries(data).map(([model, rows]) => [model, rows.length])
  );
}

function isUuid(value: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    value
  );
}

@Injectable()
export class DataPreviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(BackupService)
    private readonly backups: BackupService,
    @Inject(BACKUP_OPTIONS)
    private readonly options: BackupOptions
  ) {}

  private async authorize(principal: AuthenticatedPrincipal): Promise<void> {
    if (
      principal.authMethod !== "session" ||
      principal.isSuperuser !== true ||
      !isUuid(principal.organizationId) ||
      !isUuid(principal.userId) ||
      !isUuid(principal.membershipId) ||
      !isUuid(principal.sessionId)
    ) {
      throw new BackupError("OPERATION_PREVIEW_FORBIDDEN");
    }

    const valid = await this.prisma.withTenant(
      principal.organizationId,
      async tx => {
        const now = new Date();
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
              expiresAt: { gt: now },
            },
            select: { id: true },
          }),
        ]);
        return Boolean(membership && session);
      }
    );

    if (!valid) throw new BackupError("OPERATION_PREVIEW_FORBIDDEN");
  }

  async previewRestore(
    principal: AuthenticatedPrincipal,
    backupId: string
  ): Promise<OperationPreview> {
    await this.authorize(principal);

    const verified = await this.backups.verify(
      principal.organizationId,
      backupId
    );
    const current = await this.prisma.withTenant(
      principal.organizationId,
      tx =>
        exportTenantSnapshot(
          tx,
          principal.organizationId,
          this.options.maxBytes
        ),
      {
        isolationLevel: "RepeatableRead",
        timeout: this.options.snapshotTimeoutMs,
      }
    );

    const currentFingerprint = snapshotDataFingerprint(current);
    const currentCounts = snapshotCounts(current);
    const targetCounts = verified.manifest.counts;
    const expiresAt = new Date(Date.now() + OPERATION_PREVIEW_TTL_MS);

    const row = await this.prisma.withTenant(
      principal.organizationId,
      async tx => {
        const now = new Date();
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
              expiresAt: { gt: now },
            },
            select: { id: true },
          }),
        ]);
        if (!membership || !session) {
          throw new BackupError("OPERATION_PREVIEW_FORBIDDEN");
        }

        const created = await tx.operationPreview.create({
          data: {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            sessionId: principal.sessionId,
            kind: "RESTORE",
            targetBackupId: verified.record.id,
            targetChecksum: verified.manifest.checksum,
            currentFingerprint,
            expiresAt,
            payload: {
              targetSchemaVersion: verified.manifest.schemaVersion,
              targetByteCount: verified.bytes.length,
              targetCounts,
              currentCounts,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            requestId: created.id,
            action: "restore.preview_created",
            entityType: "operation_preview",
            entityId: created.id,
            metadata: {
              backupId: verified.record.id,
              targetChecksum: verified.manifest.checksum,
              expiresAt: created.expiresAt.toISOString(),
            },
          },
        });

        return created;
      }
    );

    return OperationPreviewSchema.parse({
      id: row.id,
      organizationId: row.organizationId,
      actorUserId: row.actorUserId,
      kind: row.kind,
      targetBackupId: row.targetBackupId,
      targetChecksum: row.targetChecksum,
      currentFingerprint: row.currentFingerprint,
      targetSchemaVersion: verified.manifest.schemaVersion,
      targetByteCount: verified.bytes.length,
      targetCounts,
      currentCounts,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    });
  }
}
