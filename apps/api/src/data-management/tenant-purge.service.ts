import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

const PolicyInputSchema = z
  .object({
    enabled: z.boolean(),
    retentionDays: z.number().int().min(30).max(3650),
    // An explicit phrase is needed each time automatic deletion is enabled.
    confirmation: z.literal("ATIVAR EXPURGO").optional(),
  })
  .strict()
  .refine(value => !value.enabled || value.confirmation === "ATIVAR EXPURGO");

export type TenantPurgePolicyView = {
  enabled: boolean;
  retentionDays: number;
  lastRunAt: string | null;
  target: "EXPIRED_OPERATION_PREVIEWS";
  estimatedRecords: number;
  cutoff: string;
};

const DEFAULT_RETENTION_DAYS = 180;
const BATCH_SIZE = 500;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

function cutoffDate(now: Date, days: number): Date {
  return new Date(now.getTime() - days * INTERVAL_MS);
}

/** Tenant-scoped purge of expired operation previews, not business data.
 * Does not touch active previews, queued jobs, CRM entities, audit logs or backups.
 */
@Injectable()
export class TenantPurgeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    principal: AuthenticatedPrincipal
  ): Promise<TenantPurgePolicyView> {
    const policy = await this.prisma.withTenant(principal.organizationId, tx =>
      tx.purgePolicy.findUnique({
        where: { organizationId: principal.organizationId },
      })
    );
    const retentionDays = policy?.retentionDays ?? DEFAULT_RETENTION_DAYS;
    const now = new Date();
    const cutoff = cutoffDate(now, retentionDays);
    const estimatedRecords = await this.prisma.withTenant(
      principal.organizationId,
      tx =>
        tx.operationPreview.count({
          where: {
            organizationId: principal.organizationId,
            expiresAt: { lt: cutoff },
          },
        })
    );
    return {
      enabled: policy?.enabled ?? false,
      retentionDays,
      lastRunAt: policy?.lastRunAt?.toISOString() ?? null,
      target: "EXPIRED_OPERATION_PREVIEWS",
      estimatedRecords,
      cutoff: cutoff.toISOString(),
    };
  }

  async configure(
    principal: AuthenticatedPrincipal,
    body: unknown,
    requestId: string
  ): Promise<TenantPurgePolicyView> {
    const parsed = PolicyInputSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Informe retenção entre 30 e 3650 dias. Para ativar, confirme "ATIVAR EXPURGO".'
      );
    const { enabled, retentionDays } = parsed.data;
    await this.prisma.withTenant(principal.organizationId, async tx => {
      const updated = await tx.purgePolicy.upsert({
        where: { organizationId: principal.organizationId },
        create: {
          organizationId: principal.organizationId,
          enabled,
          retentionDays,
          updatedBy: principal.userId,
        },
        update: { enabled, retentionDays, updatedBy: principal.userId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId: requestId || randomUUID(),
          action: "purge.policy_changed",
          entityType: "purge_policy",
          entityId: principal.organizationId,
          metadata: {
            enabled: updated.enabled,
            retentionDays: updated.retentionDays,
            target: "EXPIRED_OPERATION_PREVIEWS",
          },
        },
      });
    });
    return this.read(principal);
  }

  /**
   * A single pass per tenant at most once every 24h; no catch-up burst.
   * All state changes, bounded deletion and mandatory audit share a transaction.
   * A per-tenant advisory lock prevents concurrent replica cycles.
   */
  async runDue(now: Date = new Date()): Promise<number> {
    if (!Number.isFinite(now.getTime())) throw Error("INVALID_PURGE_DATE");
    const organizations = await this.prisma.organization.findMany({
      // Do not join purge_policies outside a tenant context: its RLS would hide every row.
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    let removed = 0;
    for (const organization of organizations) {
      removed += await this.prisma.withTenant(organization.id, async tx => {
        const [lock] = await tx.$queryRawUnsafe<{ acquired: boolean }[]>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
          `purge-tenant:${organization.id}`
        );
        if (!lock?.acquired) return 0;
        const policy = await tx.purgePolicy.findUnique({
          where: { organizationId: organization.id },
        });
        if (
          !policy?.enabled ||
          (policy.lastRunAt &&
            now.getTime() - policy.lastRunAt.getTime() < INTERVAL_MS)
        )
          return 0;
        const cutoff = cutoffDate(now, policy.retentionDays);
        const candidates = await tx.operationPreview.findMany({
          where: {
            organizationId: organization.id,
            expiresAt: { lt: cutoff },
          },
          select: { id: true },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
          take: BATCH_SIZE,
        });
        let count = 0;
        if (candidates.length > 0) {
          const deleted = await tx.operationPreview.deleteMany({
            where: {
              organizationId: organization.id,
              id: { in: candidates.map(item => item.id) },
              expiresAt: { lt: cutoff },
            },
          });
          count = deleted.count;
        }
        await tx.purgePolicy.update({
          where: { organizationId: organization.id },
          data: { lastRunAt: now },
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: null,
            requestId: randomUUID(),
            action: "purge.expired_previews_completed",
            entityType: "purge_policy",
            entityId: organization.id,
            metadata: {
              target: "EXPIRED_OPERATION_PREVIEWS",
              retentionDays: policy.retentionDays,
              cutoff: cutoff.toISOString(),
              recordsDeleted: count,
              limit: BATCH_SIZE,
            },
          },
        });
        return count;
      });
    }
    return removed;
  }
}
