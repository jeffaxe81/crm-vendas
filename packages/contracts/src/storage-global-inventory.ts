import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bytes = z.string().regex(/^(0|[1-9][0-9]*)$/);

export const StorageInventoryFindingStatusSchema = z.enum([
  "ORPHAN",
  "MISSING",
  "SIZE_MISMATCH",
  "UNREADABLE",
  "STATE_INCONSISTENCY",
]);

export const StorageGlobalInventorySchema = z
  .object({
    configured: z.boolean(),
    readOnly: z.literal(true),
    complete: z.boolean(),
    atomicSnapshot: z.literal(false),
    scope: z.literal("ALL_ORGANIZATIONS"),
    catalogCount: count,
    physicalObjectCount: count,
    physicalBytes: bytes,
    orphanCount: count,
    missingCount: count,
    sizeMismatchCount: count,
    unreadableCount: count,
    stateInconsistencyCount: count,
    temporaryCount: count,
    unexpectedCount: count,
    tenants: z.array(
      z.object({
        organizationId: z.string().uuid(),
        catalogCount: count,
        completedCount: count,
        physicalObjectCount: count,
        catalogBytes: bytes,
        physicalBytes: bytes,
      })
    ),
    findings: z.array(
      z.object({
        backupId: z.string().uuid(),
        organizationId: z.string().uuid().nullable(),
        status: StorageInventoryFindingStatusSchema,
        catalogBytes: bytes.nullable(),
        filesystemBytes: bytes.nullable(),
      })
    ),
  })
  .refine(report => report.configured || !report.complete);

export type StorageGlobalInventory = z.infer<
  typeof StorageGlobalInventorySchema
>;
export type StorageInventoryFindingStatus = z.infer<
  typeof StorageInventoryFindingStatusSchema
>;
