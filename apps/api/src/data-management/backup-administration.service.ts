import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { BackupRecordSchema } from "@axes/contracts";

import type {
  AuthenticatedPrincipal,
} from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";
import { BackupError } from "./backup-error";
import { nextBackupRun, validateSchedule } from "./backup-schedule";
import { BACKUP_STORE, BackupService } from "./backup.service";
import type { BackupStore } from "./backup-store";
import { DataPreviewService } from "./data-preview.service";

function assertId(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new BadRequestException("Identificador de backup inválido.");
  }
  return value.toLowerCase();
}

@Injectable()
export class BackupAdministrationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BackupService) private readonly backupService: BackupService,
    @Inject(DataPreviewService) private readonly previews: DataPreviewService,
    @Inject(BACKUP_STORE) private readonly store: BackupStore | null
  ) {}

  private configured(): void {
    if (!this.store) {
      throw new ServiceUnavailableException(
        "Armazenamento de backups não configurado no servidor."
      );
    }
  }

  async list(principal: AuthenticatedPrincipal) {
    const rows = await this.prisma.withTenant(principal.organizationId, tx =>
      tx.backupRecord.findMany({
        where: { organizationId: principal.organizationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      })
    );
    return {
      configured: Boolean(this.store),
      backups: rows.map(row =>
        BackupRecordSchema.parse({
          ...row,
          byteCount: row.byteCount === null ? null : Number(row.byteCount),
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
        })
      ),
    };
  }

  async operations(principal: AuthenticatedPrincipal) {
    const rows = await this.prisma.withTenant(principal.organizationId, tx =>
      tx.dataOperation.findMany({
        where: {
          organizationId: principal.organizationId,
          kind: "BACKUP",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
        select: {
          id: true,
          state: true,
          stage: true,
          processed: true,
          total: true,
          errorCode: true,
          createdAt: true,
          completedAt: true,
        },
      })
    );
    return rows.map(row => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }

  async requestBackup(principal: AuthenticatedPrincipal, requestId: string) {
    this.configured();
    return this.prisma.withTenant(principal.organizationId, async tx => {
      const pending = await tx.dataOperation.count({
        where: {
          organizationId: principal.organizationId,
          kind: "BACKUP",
          state: { in: ["PENDING", "RUNNING"] },
        },
      });
      if (pending) {
        throw new ConflictException(
          "Já existe um backup em execução ou na fila."
        );
      }
      const operation = await tx.dataOperation.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          kind: "BACKUP",
          state: "PENDING",
          payload: { reason: "MANUAL" },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId: requestId || randomUUID(),
          action: "backup.manual_requested",
          entityType: "data_operation",
          entityId: operation.id,
          metadata: { operationId: operation.id },
        },
      });
      return { id: operation.id, state: "PENDING" };
    });
  }

  async getSchedule(principal: AuthenticatedPrincipal) {
    const row = await this.prisma.withTenant(principal.organizationId, tx =>
      tx.backupSchedule.findUnique({
        where: { organizationId: principal.organizationId },
      })
    );
    return row
      ? {
          enabled: row.enabled,
          frequency: row.frequency,
          localTime: row.localTime,
          weekday: row.weekday,
          intervalMinutes: row.intervalMinutes,
          retentionCount: row.retentionCount,
          timezone: row.timezone,
          nextRunAt: row.nextRunAt?.toISOString() ?? null,
        }
      : {
          enabled: false,
          frequency: "DAILY",
          localTime: "02:00",
          weekday: 0,
          intervalMinutes: null,
          retentionCount: 15,
          timezone: "America/Sao_Paulo",
          nextRunAt: null,
        };
  }

  async saveSchedule(
    principal: AuthenticatedPrincipal,
    body: unknown,
    requestId: string
  ) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException("Agendamento inválido.");
    }
    const { enabled, ...input } = body as Record<string, unknown>;
    if (typeof enabled !== "boolean") {
      throw new BadRequestException("enabled deve ser booleano.");
    }
    let settings: ReturnType<typeof validateSchedule>;
    try {
      settings = validateSchedule(input);
    } catch {
      throw new BadRequestException("Configuração de agendamento inválida.");
    }
    if (enabled) this.configured();
    const nextRunAt = enabled ? nextBackupRun(settings, new Date()) : null;
    await this.prisma.withTenant(principal.organizationId, async tx => {
      await tx.backupSchedule.upsert({
        where: { organizationId: principal.organizationId },
        create: {
          organizationId: principal.organizationId,
          enabled,
          ...settings,
          nextRunAt,
          updatedBy: principal.userId,
        },
        update: {
          enabled,
          ...settings,
          nextRunAt,
          updatedBy: principal.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId: requestId || randomUUID(),
          action: "backup.schedule_changed",
          entityType: "backup_schedule",
          entityId: principal.organizationId,
          metadata: {
            enabled,
            frequency: settings.frequency,
            retentionCount: settings.retentionCount,
          },
        },
      });
    });
    return this.getSchedule(principal);
  }

  async previewRestore(principal: AuthenticatedPrincipal, id: string) {
    this.configured();
    try {
      return await this.previews.previewRestore(principal, assertId(id));
    } catch (error) {
      if (error instanceof BackupError) {
        throw new BadRequestException(error.code);
      }
      throw error;
    }
  }

  async download(
    principal: AuthenticatedPrincipal,
    id: string,
    requestId: string
  ) {
    this.configured();
    let verified;
    try {
      verified = await this.backupService.verify(
        principal.organizationId,
        assertId(id)
      );
    } catch (error) {
      if (error instanceof BackupError) {
        throw new BadRequestException(error.code);
      }
      throw error;
    }
    await this.prisma.withTenant(principal.organizationId, tx =>
      tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId: requestId || randomUUID(),
          action: "backup.download_requested",
          entityType: "backup",
          entityId: verified.record.id,
          metadata: { backupId: verified.record.id },
        },
      })
    );
    return verified.bytes;
  }
}
