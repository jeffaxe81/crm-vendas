import type { Prisma } from "../generated/prisma/client";
import {
  BACKUP_SCHEMA,
  quotedIdentifier,
  snapshotFields,
} from "./backup-models";
import { BackupError } from "./backup-error";
import { isValidSnapshotField, type SnapshotData } from "./backup-manifest";
import { validateRestoreIdentityReferences } from "./restore-identity-check";
import { validateRestorePreservedMemberships } from "./restore-membership-check";
import { validateRestoreReferences } from "./restore-reference-check";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";
import { revokeActiveRefreshSessionsAfterRestore } from "./restore-refresh-sessions";
import { requireSupportedTicketRestoreDependencies } from "./restore-ticket-dependencies";
import {
  applyTicketProtocolCounterHighWater,
  prepareTicketProtocolCounterHighWater,
} from "./restore-ticket-protocol-counter";

// Parent-first insertion order; deletion uses the reverse order. Only these
// reviewed FULL/REPLACE policies are supported by this internal increment.
const RESTORE_MODELS = [
  "Role",
  "RolePermission",
  "Company",
  "Contact",
  "ContactChannel",
  "CompanyContact",
  "RelationshipEntry",
  "Tag",
  "CompanyTag",
  "ContactTag",
  "Pipeline",
  "PipelineStage",
  "Product",
  "Opportunity",
  "OpportunityItem",
  "Activity",
  "Territory",
  "TerritoryQuota",
  "TerritoryTarget",
  "TerritoryMetrics",
  "SupportQueue",
  "SlaPolicy",
  "Ticket",
  "TicketEvent",
  "CustomFieldDefinition",
  "CompanyCustomFieldValue",
  "ContactCustomFieldValue",
  "UserWorkspacePreference",
] as const;
const implemented = new Set<string>(RESTORE_MODELS);

/**
 * Read-only assessment of currently unsupported full-replacement models.
 * Inspect both the target and the current tenant: missing target rows do not
 * make deleting live rows safe. This is NOT permission to execute restore.
 */
export function unsupportedRestoreModels(
  currentCounts: Readonly<Record<string, number>>,
  targetCounts: Readonly<Record<string, number>>
): string[] {
  // Week 4: missing counts mean zero, but invalid counts must not quietly
  // suppress a blocker in a read-only applicability assessment.
  for (const counts of [currentCounts, targetCounts]) {
    if (!counts || typeof counts !== "object" || Array.isArray(counts))
      throw new BackupError("RESTORE_TARGET_INVALID");
    for (const count of Object.values(counts)) {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new BackupError("RESTORE_TARGET_INVALID");
    }
  }
  return TENANT_DATA_REGISTRY.filter(
    policy =>
      policy.export !== "EXCLUDE" &&
      policy.scope === "ORGANIZATION" &&
      policy.restore === "REPLACE" &&
      !implemented.has(policy.model) &&
      ((currentCounts[policy.model] ?? 0) > 0 ||
        (targetCounts[policy.model] ?? 0) > 0)
  )
    .map(policy => policy.model)
    .sort();
}

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
          // Validate all scalar types and native bounds before the first
          // DELETE, even if an internal caller skipped snapshot decoding.
          if (!isValidSnapshotField(value, field))
            fail("RESTORE_TARGET_INVALID");
          // Decimal snapshots are strings. Never pass money through Number,
          // including values outside JavaScript's exact integer range.
          if (
            field.type === "Decimal" &&
            value !== null &&
            typeof value !== "string"
          ) {
            return fail("RESTORE_TARGET_INVALID");
          }
          if (field.type === "Json") {
            if (value === null) {
              if (field.isRequired) return fail("RESTORE_TARGET_INVALID");
            } else {
              if (typeof value !== "string")
                return fail("RESTORE_TARGET_INVALID");
              try {
                // Check syntax only; keep the raw text for native SQL decoding.
                // Using the parsed result would round large JSON numbers.
                JSON.parse(value);
              } catch {
                return fail("RESTORE_TARGET_INVALID");
              }
            }
          }
          if (field.kind === "enum" && value !== null) {
            const mapped = BACKUP_SCHEMA.enums
              .find(item => item.name === field.type)
              ?.values.find(item => item.name === value);
            if (!mapped) return fail("RESTORE_TARGET_INVALID");
            value = mapped.dbName;
          } else if (
            field.kind !== "enum" &&
            ![
              "String",
              "DateTime",
              "Int",
              "Boolean",
              "Decimal",
              "Json",
            ].includes(field.type)
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
      selectColumns: fields
        .map(field => {
          const column = quotedIdentifier(field.dbName);
          return field.type === "Json" ? `(${column} #>> '{}')::jsonb` : column;
        })
        .join(", "),
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
 * Restores the reviewed business graph only. Unsupported REPLACE models in
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
  const protocolCounterHighWater = prepareTicketProtocolCounterHighWater(
    data,
    organizationId
  );
  validateRestoreReferences(data);
  await validateRestoreIdentityReferences(tx, organizationId, data);
  await validateRestorePreservedMemberships(tx, organizationId, data);
  // Direct callers cannot bypass the safety checks of the locked preflight.
  await requireSupportedTicketRestoreDependencies(tx, organizationId, data);
  await requireCurrentPolicies(tx, organizationId);

  for (const { table } of [...graph].reverse()) {
    await tx.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE "organization_id"=$1::uuid`,
      organizationId
    );
  }
  for (const { table, columns, selectColumns, rows } of graph) {
    if (rows.length === 0) continue;
    // PostgreSQL converts timestamp strings directly, retaining all six digits.
    // Identifiers come only from reviewed metadata; all values are bound JSON.
    // Json fields contain raw JSON text, wrapped as JSON strings by the recordset.
    // Extract and cast that text in PostgreSQL to retain numbers and JSON null;
    // nullable SQL NULL stays distinct from the raw JSON text "null".
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO ${table} (${columns}) SELECT ${selectColumns}
       FROM json_populate_recordset(NULL::${table}, $1::json)`,
      JSON.stringify(rows)
    );
    if (inserted !== rows.length) fail("RESTORE_TARGET_INVALID");
  }

  await applyTicketProtocolCounterHighWater(
    tx,
    organizationId,
    protocolCounterHighWater
  );
  await revokeActiveRefreshSessionsAfterRestore(tx, organizationId);
}
