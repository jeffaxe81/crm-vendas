import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import { BACKUP_ENVELOPE_OVERHEAD_BYTES } from "./backup-store";

/** Always call before operation/catalog row locks; restore may already own maintenance exclusively. */
export async function lockBackupStorage(
  tx: Prisma.TransactionClient,
  organizationId: string
) {
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
    `tenant-maintenance:${organizationId}`
  );
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
    `tenant-storage:${organizationId}`
  );
}

export async function backupStorageUsage(
  tx: Prisma.TransactionClient,
  organizationId: string
) {
  const [usage] = await tx.$queryRaw<{ used: bigint; reserved: bigint }[]>`
 SELECT
 COALESCE((SELECT SUM(byte_count + ${BigInt(BACKUP_ENVELOPE_OVERHEAD_BYTES)}) FROM public.backups WHERE organization_id=${organizationId}::uuid AND state IN ('COMPLETED','DELETING')),0)::bigint AS used,
 COALESCE((SELECT SUM(r.physical_bytes) FROM public.backup_storage_reservations r WHERE r.organization_id=${organizationId}::uuid AND NOT EXISTS (SELECT 1 FROM public.backups b WHERE b.organization_id=r.organization_id AND b.id=r.backup_id AND b.state IN ('COMPLETED','DELETING'))),0)::bigint AS reserved`;
  return { usedBytes: usage!.used, reservedBytes: usage!.reserved };
}

/** Durable before publication. Same-ID retries never shrink an uncertain object's reservation. */
export async function reserveBackupStorage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  backupId: string,
  physicalBytes: bigint,
  adoptPublished = false
) {
  if (physicalBytes <= 0n) throw new BackupError("BACKUP_INVALID");
  await lockBackupStorage(tx, organizationId);
  const [existing] = await tx.$queryRaw<
    { physical_bytes: bigint }[]
  >`SELECT physical_bytes FROM public.backup_storage_reservations WHERE organization_id=${organizationId}::uuid AND backup_id=${backupId}::uuid`;
  const [allocation] = await tx.$queryRaw<
    { allocation_gib: number | null; enforced: boolean }[]
  >`SELECT allocation_gib, enforced FROM public.tenant_storage_allocations WHERE organization_id=${organizationId}::uuid`;
  const bytes =
    existing && existing.physical_bytes > physicalBytes
      ? existing.physical_bytes
      : physicalBytes;
  const usage = await backupStorageUsage(tx, organizationId);
  const additionalBytes = bytes - (existing?.physical_bytes ?? 0n);
  // Adoption accounts for bytes that already exist; rejecting it would hide an existing physical charge.
  if (
    !adoptPublished &&
    additionalBytes > 0n &&
    allocation?.enforced &&
    allocation.allocation_gib !== null &&
    usage.usedBytes + usage.reservedBytes + additionalBytes >
      BigInt(allocation.allocation_gib) * 1073741824n
  )
    throw new BackupError("BACKUP_QUOTA_EXCEEDED");
  await tx.$executeRaw`INSERT INTO public.backup_storage_reservations (organization_id,backup_id,physical_bytes) VALUES (${organizationId}::uuid,${backupId}::uuid,${bytes}) ON CONFLICT (organization_id,backup_id) DO UPDATE SET physical_bytes=EXCLUDED.physical_bytes`;
}

/** Only after successful removal (or catalog completion, which takes over the physical charge). */
export async function releaseBackupStorage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  backupId: string
) {
  await lockBackupStorage(tx, organizationId);
  await tx.$executeRaw`DELETE FROM public.backup_storage_reservations WHERE organization_id=${organizationId}::uuid AND backup_id=${backupId}::uuid`;
}
