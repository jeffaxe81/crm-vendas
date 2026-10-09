import type { Prisma } from "../generated/prisma/client";
import {
  BACKUP_SCHEMA,
  modelMetadata,
  quotedIdentifier,
  snapshotFields,
  SNAPSHOT_POLICIES,
} from "./backup-models";
import { BackupError } from "./backup-error";
import {
  referencedUserIds,
  type SnapshotData,
  type SnapshotRow,
} from "./backup-manifest";
import type { TenantDataPolicy } from "./tenant-data-registry";

export async function exportTenantSnapshot(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  maxBytes: number
): Promise<SnapshotData> {
  const [isolation] = await transaction.$queryRawUnsafe<
    { transaction_isolation: string }[]
  >("SHOW transaction_isolation");
  if (
    !isolation ||
    !["repeatable read", "serializable"].includes(
      isolation.transaction_isolation
    )
  )
    throw new BackupError("BACKUP_SNAPSHOT_ISOLATION_REQUIRED");
  for (const policy of SNAPSHOT_POLICIES) {
    if (
      /^(File|Attachment|StoredFile|FileObject)$/.test(policy.model) ||
      snapshotFields(policy).some(
        f =>
          f.type === "Bytes" ||
          /(?:file|attachment|storage).*(?:path|key|url|uri|id)$/i.test(f.name)
      )
    )
      throw new BackupError("BACKUP_ATTACHMENT_ADAPTER_REQUIRED");
  }
  const databaseColumns = await transaction.$queryRawUnsafe<
    { table_name: string; column_name: string }[]
  >(
    "SELECT table_name::text,column_name::text FROM information_schema.columns WHERE table_schema='public'"
  );
  for (const model of BACKUP_SCHEMA.models) {
    const actual = databaseColumns
      .filter(c => c.table_name === model.dbName)
      .map(c => c.column_name)
      .sort();
    const expected = model.fields
      .filter(f => f.kind !== "object")
      .map(f => f.dbName)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
  }
  // NEO settings is managed through a standalone SQL migration, not Prisma.
  // It is deliberately excluded from snapshot export and restore. Keep this
  // allowlist explicit: any other unknown tenant table must still fail closed.
  const explicitlyExcludedTenantTables = new Set([
    "neo_communication_settings",
  ]);
  if (
    databaseColumns.some(
      c =>
        c.column_name === "organization_id" &&
        !BACKUP_SCHEMA.models.some(m => m.dbName === c.table_name) &&
        !explicitlyExcludedTenantTables.has(c.table_name)
    )
  )
    throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
  const data: SnapshotData = {};
  let usedBytes = 0;
  async function readRows(policy: TenantDataPolicy, scope: string | string[]) {
    const model = modelMetadata(policy);
    const fields = snapshotFields(policy)
      .map(field => {
        const identifier = quotedIdentifier(field.dbName);
        let expression = identifier;
        if (field.type === "DateTime") {
          if (field.nativeType !== "Timestamptz(6)")
            throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
          expression = `to_char(${identifier} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
        } else if (["Decimal", "BigInt", "Json"].includes(field.type))
          expression = `${identifier}::text`;
        else if (field.kind === "enum") {
          const values = BACKUP_SCHEMA.enums.find(
            e => e.name === field.type
          )?.values;
          if (!values) throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
          const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
          expression = `CASE ${identifier}::text ${values.map(v => `WHEN ${literal(v.dbName)} THEN ${literal(v.name)}`).join(" ")} END`;
        }
        return `${expression} AS ${quotedIdentifier(field.name)}`;
      })
      .join(", ");
    const where =
      policy.scope === "ORGANIZATION_ROOT"
        ? '"id"=$1::uuid'
        : policy.scope === "REFERENCED_USERS"
          ? '"id"=ANY($1::uuid[])'
          : '"organization_id"=$1::uuid';
    const order = model.primaryKey
      .map(name =>
        quotedIdentifier(model.fields.find(f => f.name === name)!.dbName)
      )
      .join(", ");
    const rows: SnapshotRow[] = [];
    if (!(Array.isArray(scope) && scope.length === 0))
      for (let offset = 0; ; offset += 100) {
        const page = await transaction.$queryRawUnsafe<SnapshotRow[]>(
          `SELECT ${fields} FROM "public".${quotedIdentifier(policy.table)} WHERE ${where} ORDER BY ${order} LIMIT 100 OFFSET $2`,
          scope,
          offset
        );
        for (const row of page) {
          usedBytes += Buffer.byteLength(JSON.stringify(row));
          if (usedBytes > maxBytes) throw new BackupError("BACKUP_TOO_LARGE");
          rows.push(row);
        }
        if (page.length < 100) break;
      }
    data[policy.model] = rows;
  }
  for (const policy of SNAPSHOT_POLICIES.filter(
    p => p.scope !== "REFERENCED_USERS"
  ))
    await readRows(policy, organizationId);
  for (const policy of SNAPSHOT_POLICIES.filter(
    p => p.scope === "REFERENCED_USERS"
  ))
    await readRows(policy, referencedUserIds(data));
  return data;
}
