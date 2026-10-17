import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

const GIB = 1024n * 1024n * 1024n;
const LIMIT = 10240;
const inputSchema = z
  .object({
    allocatedGiB: z.number().int().min(1).max(LIMIT).nullable(),
    confirmation: z.literal("AJUSTAR COTA"),
  })
  .strict();

type AllocationRow = {
  allocation_gib: number | null;
  updated_at: Date;
};

export type TenantStorageAllocationView = {
  allocatedGiB: number | null;
  usedBytes: string;
  backupCount: number;
  usagePercent: number | null;
  alertLevel: "UNALLOCATED" | "OK" | "WARNING" | "EXCEEDED";
  enforced: false;
  scope: "ENCRYPTED_BACKUP_CATALOG";
  updatedAt: string | null;
};

/**
 * Capacity planning ONLY: counts completed/pending-deletion backup catalog bytes.
 * Does not change filesystem capacity or reject writes; there is deliberately no
 * misleading hard-cap assertion before the worker can reserve bytes atomically.
 */
@Injectable()
export class TenantStorageAllocationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    principal: AuthenticatedPrincipal
  ): Promise<TenantStorageAllocationView> {
    return this.prisma.withTenant(principal.organizationId, async tx => {
      const [allocation] = await tx.$queryRaw<AllocationRow[]>`
        SELECT allocation_gib, updated_at
        FROM public.tenant_storage_allocations
        WHERE organization_id = ${principal.organizationId}::uuid
      `;
      const usage = await tx.backupRecord.aggregate({
        where: {
          organizationId: principal.organizationId,
          state: { in: ["COMPLETED", "DELETING"] },
        },
        _sum: { byteCount: true },
        _count: { id: true },
      });
      const usedBytes = usage._sum.byteCount ?? 0n;
      const allocatedGiB = allocation?.allocation_gib ?? null;
      const allocatedBytes =
        allocatedGiB === null ? null : BigInt(allocatedGiB) * GIB;
      const usagePercent =
        allocatedBytes === null
          ? null
          : Number((usedBytes * 100n) / allocatedBytes);
      const alertLevel =
        usagePercent === null
          ? "UNALLOCATED"
          : usagePercent >= 100
            ? "EXCEEDED"
            : usagePercent >= 80
              ? "WARNING"
              : "OK";
      return {
        allocatedGiB,
        usedBytes: usedBytes.toString(),
        backupCount: usage._count.id,
        usagePercent,
        alertLevel,
        enforced: false as const,
        scope: "ENCRYPTED_BACKUP_CATALOG" as const,
        updatedAt: allocation?.updated_at.toISOString() ?? null,
      };
    });
  }

  async configure(
    principal: AuthenticatedPrincipal,
    body: unknown,
    requestId: string
  ): Promise<TenantStorageAllocationView> {
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Informe uma capacidade de 1 a 10240 GiB (ou sem limite definido) e confirme "AJUSTAR COTA".'
      );
    }
    const { allocatedGiB } = parsed.data;
    await this.prisma.withTenant(principal.organizationId, async tx => {
      // Serialize administrator changes for the same tenant.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${"tenant-storage:" + principal.organizationId}, 0)
        )
      `;
      const [previous] = await tx.$queryRaw<AllocationRow[]>`
        SELECT allocation_gib, updated_at
        FROM public.tenant_storage_allocations
        WHERE organization_id = ${principal.organizationId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO public.tenant_storage_allocations
          (organization_id, allocation_gib, updated_by)
        VALUES (
          ${principal.organizationId}::uuid,
          ${allocatedGiB},
          ${principal.userId}::uuid
        )
        ON CONFLICT (organization_id)
        DO UPDATE SET allocation_gib = EXCLUDED.allocation_gib,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = CURRENT_TIMESTAMP
      `;
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId: requestId || randomUUID(),
          action: "storage.allocation_changed",
          entityType: "tenant_storage_allocation",
          entityId: principal.organizationId,
          metadata: {
            previousGiB: previous?.allocation_gib ?? null,
            allocatedGiB,
            scope: "ENCRYPTED_BACKUP_CATALOG",
            enforced: false,
          },
        },
      });
    });
    return this.read(principal);
  }
}
