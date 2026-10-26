import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

export const PURGE_CATEGORIES = [
  "EXPIRED_OPERATION_PREVIEWS",
  "TERMINAL_WEBHOOK_DELIVERIES",
] as const;
type Category = (typeof PURGE_CATEGORIES)[number];
const CategoriesSchema = z
  .array(z.enum(PURGE_CATEGORIES))
  .min(1)
  .max(2)
  .refine(v => new Set(v).size === v.length);
const SimulationSchema = z
  .object({
    retentionDays: z.number().int().min(30).max(3650),
    categories: CategoriesSchema,
  })
  .strict();
const PolicyInputSchema = z
  .object({
    enabled: z.boolean(),
    categories: CategoriesSchema.optional(),
    retentionDays: z.number().int().min(30).max(3650),
    // An explicit phrase is needed each time automatic deletion is enabled.
    confirmation: z.literal("ATIVAR EXPURGO").optional(),
  })
  .strict()
  .refine(value => !value.enabled || value.confirmation === "ATIVAR EXPURGO");

export type TenantPurgePolicyView = {
  categories: Category[];
  counts: Record<Category, number>;
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

/** Tenant-scoped opt-in purge of bounded technical categories.
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
    const categories = (policy?.categories ?? [
      "EXPIRED_OPERATION_PREVIEWS",
    ]) as Category[];
    const counts = await this.counts(
      principal.organizationId,
      cutoff,
      categories
    );
    const estimatedRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      categories,
      counts,
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
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        `purge-tenant:${principal.organizationId}`
      );
      const current = await tx.purgePolicy.findUnique({
        where: { organizationId: principal.organizationId },
      });
      const categories = parsed.data.categories ??
        current?.categories ?? ["EXPIRED_OPERATION_PREVIEWS"];
      const updated = await tx.purgePolicy.upsert({
        where: { organizationId: principal.organizationId },
        create: {
          organizationId: principal.organizationId,
          enabled,
          retentionDays,
          categories,
          updatedBy: principal.userId,
        },
        update: {
          enabled,
          retentionDays,
          categories,
          updatedBy: principal.userId,
        },
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
            categories: updated.categories,
            enabled: updated.enabled,
            retentionDays: updated.retentionDays,
            target: "EXPIRED_OPERATION_PREVIEWS",
          },
        },
      });
    });
    return this.read(principal);
  }

  private predicate(category: Category): string {
    if (category === "EXPIRED_OPERATION_PREVIEWS")
      return `p.organization_id = $1::uuid AND p.expires_at < $2 AND NOT EXISTS (SELECT 1 FROM data_operations o WHERE o.organization_id = p.organization_id AND o.payload->>'previewId' = p.id::text)`;
    if (category === "TERMINAL_WEBHOOK_DELIVERIES")
      return `p.organization_id = $1::uuid AND p.created_at < $2 AND EXISTS (SELECT 1 FROM webhook_dispatches d WHERE d.id = p.dispatch_id AND d.organization_id = p.organization_id AND d.status IN ('DELIVERED','EXHAUSTED','CANCELLED') AND d.locked_until IS NULL AND d.lease_token IS NULL AND d.updated_at < $2)`;
    throw new BadRequestException("INVALID_PURGE_CATEGORY");
  }

  private async counts(
    organizationId: string,
    cutoff: Date,
    categories: Category[]
  ) {
    return this.prisma.withTenant(
      organizationId,
      async tx => {
        const counts: Record<Category, number> = {
          EXPIRED_OPERATION_PREVIEWS: 0,
          TERMINAL_WEBHOOK_DELIVERIES: 0,
        };
        for (const category of categories) {
          const table =
            category === "EXPIRED_OPERATION_PREVIEWS"
              ? "operation_previews"
              : "webhook_deliveries";
          const [result] = await tx.$queryRawUnsafe<{ count: bigint }[]>(
            `SELECT count(*) AS count FROM ${table} p WHERE ${this.predicate(category)}`,
            organizationId,
            cutoff
          );
          counts[category] = Number(result?.count ?? 0);
        }
        return counts;
      },
      { isolationLevel: "RepeatableRead" }
    );
  }

  async simulate(principal: AuthenticatedPrincipal, body: unknown) {
    const parsed = SimulationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("INVALID_PURGE_SIMULATION");
    const cutoff = cutoffDate(new Date(), parsed.data.retentionDays);
    const counts = await this.counts(
      principal.organizationId,
      cutoff,
      parsed.data.categories
    );
    return {
      dryRun: true,
      cutoff: cutoff.toISOString(),
      categories: parsed.data.categories,
      counts,
      estimatedRecords: Object.values(counts).reduce((a, b) => a + b, 0),
      batchSize: BATCH_SIZE,
    };
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
        const counts: Record<Category, number> = {
          EXPIRED_OPERATION_PREVIEWS: 0,
          TERMINAL_WEBHOOK_DELIVERIES: 0,
        };
        await tx.$executeRawUnsafe(
          "SELECT set_config('app.technical_purge', 'on', true)"
        );
        for (const category of policy.categories as Category[]) {
          const predicate = this.predicate(category);
          const table =
            category === "EXPIRED_OPERATION_PREVIEWS"
              ? "operation_previews"
              : "webhook_deliveries";
          const deleted = await tx.$queryRawUnsafe<{ id: string }[]>(
            `WITH candidates AS MATERIALIZED (SELECT p.id FROM ${table} p WHERE ${predicate} ORDER BY p.created_at, p.id LIMIT $3 FOR UPDATE OF p SKIP LOCKED) DELETE FROM ${table} p USING candidates c WHERE p.id = c.id AND p.organization_id = $1::uuid RETURNING p.id`,
            organization.id,
            cutoff,
            BATCH_SIZE
          );
          counts[category] = deleted.length;
        }
        const count = Object.values(counts).reduce((a, b) => a + b, 0);
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
              categories: policy.categories,
              counts,
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
