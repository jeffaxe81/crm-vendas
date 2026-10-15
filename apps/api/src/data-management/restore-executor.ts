import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData, SnapshotRow } from "./backup-manifest";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";

const IMPLEMENTED_REPLACE_MODELS = new Set(["Company"]);

function fail(code: string): never {
  throw new BackupError(code);
}

function requiredString(row: SnapshotRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") return fail("RESTORE_TARGET_INVALID");
  return value;
}

function optionalString(row: SnapshotRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") return fail("RESTORE_TARGET_INVALID");
  return value;
}

function requiredNumber(row: SnapshotRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fail("RESTORE_TARGET_INVALID");
  }
  return value;
}

async function requireMaintenanceContext(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  const [context] = await tx.$queryRawUnsafe<
    {
      maintenance: string | null;
      isolation: string;
      organization: string | null;
    }[]
  >(
    `SELECT current_setting('app.maintenance_authorized',true) AS maintenance,
       current_setting('transaction_isolation') AS isolation,
       current_setting('app.current_organization_id',true) AS organization`
  );

  if (
    context?.maintenance !== "on" ||
    !["repeatable read", "serializable"].includes(context.isolation) ||
    context.organization !== organizationId
  ) {
    fail("RESTORE_MAINTENANCE_REQUIRED");
  }
}

function requireImplementedPolicies(data: SnapshotData): void {
  for (const policy of TENANT_DATA_REGISTRY) {
    if (
      policy.export === "EXCLUDE" ||
      policy.scope !== "ORGANIZATION" ||
      policy.restore !== "REPLACE" ||
      IMPLEMENTED_REPLACE_MODELS.has(policy.model)
    ) {
      continue;
    }

    if ((data[policy.model] ?? []).length > 0) {
      fail("RESTORE_POLICY_UNSUPPORTED");
    }
  }
}

function companyData(row: SnapshotRow, organizationId: string) {
  if (requiredString(row, "organizationId") !== organizationId) {
    fail("RESTORE_TARGET_INVALID");
  }

  return {
    id: requiredString(row, "id"),
    organizationId,
    legalName: requiredString(row, "legalName"),
    tradeName: optionalString(row, "tradeName"),
    document: optionalString(row, "document"),
    website: optionalString(row, "website"),
    notes: optionalString(row, "notes"),
    createdAt: requiredString(row, "createdAt"),
    updatedAt: requiredString(row, "updatedAt"),
    createdBy: requiredString(row, "createdBy"),
    updatedBy: requiredString(row, "updatedBy"),
    version: requiredNumber(row, "version"),
    deletedAt: optionalString(row, "deletedAt"),
    deletedBy: optionalString(row, "deletedBy"),
  };
}

/**
 * Internal restore primitive.
 *
 * The caller must already hold PrismaService.withMaintenance() for the target
 * organization. This first safe increment restores only Company rows, leaves
 * live users/credentials untouched, and fails closed when another non-empty
 * REPLACE policy would require mutation.
 */
export async function restoreTenantSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: SnapshotData
): Promise<void> {
  await requireMaintenanceContext(tx, organizationId);
  requireImplementedPolicies(data);

  const rows = data.Company;
  if (!Array.isArray(rows)) {
    fail("RESTORE_TARGET_INVALID");
  }

  const companies = rows.map(row => companyData(row, organizationId));

  await tx.company.deleteMany({
    where: { organizationId },
  });

  if (companies.length > 0) {
    await tx.company.createMany({
      data: companies,
    });
  }
}
