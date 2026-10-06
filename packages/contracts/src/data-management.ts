import { z } from "zod";
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const BackupReasonSchema = z.enum([
  "MANUAL",
  "SCHEDULED",
  "PRE_RESTORE",
  "PRE_DELETE",
]);
export const DataOperationStateSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);
export const BackupManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    schemaFingerprint: checksum,
    organizationId: z.string().uuid(),
    createdAt: z.string().datetime(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    checksum,
  })
  .strict();
export const BackupRecordSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    actorUserId: z.string().uuid().nullable(),
    reason: BackupReasonSchema,
    state: DataOperationStateSchema,
    schemaVersion: z.number().int().positive().nullable(),
    checksum: checksum.nullable(),
    byteCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    counts: z.record(z.string(), z.number().int().nonnegative()).nullable(),
    errorCode: z.string().max(80).nullable(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type BackupReason = z.infer<typeof BackupReasonSchema>;


export const DataOperationKindSchema = z.enum(["BACKUP", "RESTORE", "DELETE"]);
export const OperationPreviewKindSchema = z.enum(["RESTORE", "DELETE"]);
export const OperationPreviewSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    kind: OperationPreviewKindSchema,
    targetBackupId: z.string().uuid().nullable(),
    targetChecksum: checksum.nullable(),
    currentFingerprint: checksum,
    targetSchemaVersion: z.number().int().positive().nullable(),
    targetByteCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    targetCounts: z.record(z.string(), z.number().int().nonnegative()),
    currentCounts: z.record(z.string(), z.number().int().nonnegative()),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type DataOperationKind = z.infer<typeof DataOperationKindSchema>;
export type OperationPreviewKind = z.infer<typeof OperationPreviewKindSchema>;
export type OperationPreview = z.infer<typeof OperationPreviewSchema>;
