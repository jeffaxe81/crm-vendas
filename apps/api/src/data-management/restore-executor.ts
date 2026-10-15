import type { Prisma } from "../generated/prisma/client";
import {
  BACKUP_SCHEMA,
  quotedIdentifier,
  snapshotFields,
} from "./backup-models";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";
import { validateRestoreIdentityReferences } from "./restore-identity-check";
import { validateRestoreReferences } from "./restore-reference-check";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";

// Parent-first insertion order; deletion uses the reverse order. Only these
// reviewed FULL/REPLACE policies are supported by this internal increment.
const RESTORE_MODELS = [
  "Company",
  "Contact",
  "ContactChannel",
  "CompanyContact",
  "RelationshipEntry",
] as const;
const implemented = new Set<string>(RESTORE_MODELS);

function fail(code: string): never {
  throw new BackupError(code);
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

const unsupportedPolicies = TENANT_DATA_REGISTRY.filter(
  policy =>
    policy.export !== "EXCLUDE" &&
    policy.scope === "ORGANIZATION" &&
    policy.restore === "REPLACE" &&
    !implemented.has(policy.model)
);

function prepareGraph(data: SnapshotData, organizationId: string) {
  for (const policy of unsupportedPolicies) {
    const rows = data[policy.model];
    if (rows !== undefined && !Array.isArray(rows))
      fail("RESTORE_TARGET_INVALID");
    if (rows?.length) fail("RESTORE_POLICY_UNSUPPORTED");
  }

  return RESTORE_MODELS.map(model => {
    const policy = TENANT_DATA_REGISTRY.find(policy => policy.model === model);
    if (
      !policy ||
      policy.export !== "FULL" ||
      policy.restore !== "REPLACE" ||
      policy.scope !== "ORGANIZATION"
    )
      return fail("RESTORE_POLICY_UNSUPPORTED");
    const source = data[model];
    if (!Array.isArray(source)) return fail("RESTORE_TARGET_INVALID");
    const fields = snapshotFields(policy);
    const rows = source.map(row => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        row.organizationId !== organizationId ||
        Object.keys(row).length !== fields.length ||
        fields.some(field => !Object.hasOwn(row, field.name))
      ) {
        return fail("RESTORE_TARGET_INVALID");
      }
      return Object.fromEntries(
        fields.map(field => {
          let value = row[field.name];
          if (value === undefined) fail("RESTORE_TARGET_INVALID");
          if (field.kind === "enum" && value !== null) {
            const mapped = BACKUP_SCHEMA.enums
              .find(item => item.name === field.type)
              ?.values.find(item => item.name === value);
            if (!mapped) return fail("RESTORE_TARGET_INVALID");
            value = mapped.dbName;
          } else if (
            field.kind !== "enum" &&
            !["String", "DateTime", "Int", "Boolean"].includes(field.type)
          ) {
            return fail("RESTORE_POLICY_UNSUPPORTED");
          }
          return [field.dbName, value];
        })
      );
    });
    return {
      table: `"public".${quotedIdentifier(policy.table)}`,
      columns: fields.map(field => quotedIdentifier(field.dbName)).join(", "),
      rows,
    };
  });
}

async function requireCurrentPolicies(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  if (unsupportedPolicies.length === 0) return;
  const checks = unsupportedPolicies.map(
    policy =>
      `EXISTS (SELECT 1 FROM "public".${quotedIdentifier(policy.table)} WHERE "organization_id"=$1::uuid)`
  );
  const [current] = await tx.$queryRawUnsafe<{ present: boolean }[]>(
    `SELECT ${checks.join(" OR ")} AS present`,
    organizationId
  );
  if (current?.present !== false) fail("RESTORE_POLICY_UNSUPPORTED");
}

/**
 * Internal primitive for an already verified snapshot, called inside the same
 * withMaintenance transaction as the future preventive backup/confirmation.
 * Restores the company/contact graph only. Other non-empty REPLACE models in
 * either the target or live tenant fail closed; security state is preserved.
 * No HTTP route, worker operation or public restore action invokes this yet.
 */
export async function restoreTenantSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: SnapshotData
): Promise<void> {
  await requireMaintenanceContext(tx, organizationId);
  if (
    !Array.isArray(data.Organization) ||
    data.Organization.length !== 1 ||
    data.Organization[0]?.id !== organizationId
  ) {
    fail("RESTORE_TARGET_INVALID");
  }
  // Prepare the entire graph and recheck live identities before the first DELETE.
  const graph = prepareGraph(data, organizationId);
  validateRestoreReferences(data);
  await validateRestoreIdentityReferences(tx, organizationId, data);
  await requireCurrentPolicies(tx, organizationId);

  for (const { table } of [...graph].reverse()) {
    await tx.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE "organization_id"=$1::uuid`,
      organizationId
    );
  }
  for (const { table, columns, rows } of graph) {
    if (rows.length === 0) continue;
    // PostgreSQL converts timestamp strings directly, retaining all six digits.
    // Identifiers come only from reviewed metadata; all values are bound JSON.
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO ${table} (${columns}) SELECT ${columns}
       FROM json_populate_recordset(NULL::${table}, $1::json)`,
      JSON.stringify(rows)
    );
    if (inserted !== rows.length) fail("RESTORE_TARGET_INVALID");
  }
}
