import {
  BACKUP_SCHEMA,
  modelMetadata,
  SNAPSHOT_POLICIES,
} from "./backup-models";
import { BackupError } from "./backup-error";
import type { SnapshotData, SnapshotRow } from "./backup-manifest";

/**
 * Read-only check of foreign-key closure within a verified tenant snapshot.
 *
 * Schema metadata records Prisma relationFromFields, but not relationToFields.
 * Map only the relationships supported by our explicit snapshot schema.
 * A new naming pattern must be reviewed rather than silently ignored.
 *
 * This is a PRECONDITION, not a restore executor: it does not inspect
 * preserved external state, lock the tenant, or mutate any table.
 */
export function validateRestoreReferences(data: SnapshotData): void {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new BackupError("BACKUP_REFERENCES_INVALID");

  // A valid root must be a tenant UUID, not just an arbitrary nonempty string.
  // Week 1: a verified snapshot must belong to one organization even when
  // some rows have no business-model FK to exercise below.
  const roots = data.Organization;
  const organizationId =
    Array.isArray(roots) && roots.length === 1 ? roots[0]?.id : null;
  if (
    typeof organizationId !== "string" ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(organizationId)
  )
    throw new BackupError("BACKUP_REFERENCES_INVALID");

  for (const policy of SNAPSHOT_POLICIES) {
    const rows = data[policy.model];
    if (
      !Array.isArray(rows) ||
      rows.some(row => !row || typeof row !== "object" || Array.isArray(row))
    )
      throw new BackupError("BACKUP_REFERENCES_INVALID");
    // Week 2: validate Prisma primary keys before checking foreign keys.
    // Catch duplicate tickets, events and composite tenant counters early.
    const primaryKey = modelMetadata(policy).primaryKey;
    if (primaryKey.length === 0)
      throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
    const seen = new Set<string>();
    for (const row of rows) {
      const values = primaryKey.map(field => row[field]);
      if (values.some(value => value === null || value === undefined))
        throw new BackupError("BACKUP_REFERENCES_INVALID");
      const pk = JSON.stringify(values);
      if (seen.has(pk)) throw new BackupError("BACKUP_REFERENCES_INVALID");
      seen.add(pk);
    }
    if (
      (policy.scope === "ORGANIZATION" &&
        rows.some(row => row?.organizationId !== organizationId)) ||
      (policy.scope === "ORGANIZATION_ROOT" &&
        rows.some(row => row?.id !== organizationId))
    ) {
      throw new BackupError("BACKUP_REFERENCES_INVALID");
    }
  }

  const exported = new Set(SNAPSHOT_POLICIES.map(policy => policy.model));
  const schema = new Map(
    BACKUP_SCHEMA.models.map(model => [model.name, model])
  );

  function targetField(target: string, sourceField: string): string {
    if (target === "Organization" || target === "User") return "id";
    if (target === "OrganizationMembership" && sourceField.endsWith("UserId")) {
      return "userId";
    }
    const model = schema.get(target);
    if (!model) throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
    if (
      model.fields.some(
        field => field.kind !== "object" && field.name === sourceField
      )
    ) {
      return sourceField;
    }
    if (
      sourceField.endsWith("Id") &&
      model.fields.some(field => field.name === "id")
    ) {
      return "id";
    }
    throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
  }

  const key = (row: SnapshotRow, fields: readonly string[]) =>
    JSON.stringify(fields.map(field => row[field]));

  for (const policy of SNAPSHOT_POLICIES) {
    for (const relation of modelMetadata(policy).fields) {
      if (
        relation.kind !== "object" ||
        relation.relationFromFields.length === 0 ||
        !exported.has(relation.type)
      ) {
        continue;
      }
      const sourceKeys = relation.relationFromFields;
      const targetKeys = sourceKeys.map(sourceField =>
        targetField(relation.type, sourceField)
      );
      const targetRows = data[relation.type];
      const sourceRows = data[policy.model];
      if (!targetRows || !sourceRows) {
        throw new BackupError("BACKUP_REFERENCES_INVALID");
      }
      const targetSet = new Set(targetRows.map(row => key(row, targetKeys)));
      for (const row of sourceRows) {
        // Optional composite FKs may be absent (PostgreSQL MATCH SIMPLE).
        // Mandatory FKs must never be silently skipped on null or undefined.
        if (
          sourceKeys.some(
            field => row[field] === null || row[field] === undefined
          )
        ) {
          if (relation.isRequired)
            throw new BackupError("BACKUP_REFERENCES_INVALID");
          continue;
        }
        if (!targetSet.has(key(row, sourceKeys))) {
          throw new BackupError("BACKUP_REFERENCES_INVALID");
        }
      }
    }
  }
}
