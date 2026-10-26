import {
  BACKUP_SCHEMA,
  modelMetadata,
  SNAPSHOT_POLICIES,
} from "./backup-models";
import { BackupError } from "./backup-error";
import type { SnapshotData, SnapshotRow } from "./backup-manifest";
import { validateRestoreReferences } from "./restore-reference-check";

/** Remove operational rows except the FK closure required by preserved outbox records. */
export function protectedOperationalDeletionSnapshot(
  current: SnapshotData,
  protectedTicketIds: readonly string[]
): SnapshotData {
  validateRestoreReferences(current);
  const result: SnapshotData = Object.fromEntries(
    SNAPSHOT_POLICIES.map(policy => [
      policy.model,
      policy.category === "OPERATIONAL" ? [] : [...current[policy.model]!],
    ])
  );
  const policies = new Map(
    SNAPSHOT_POLICIES.map(policy => [policy.model, policy])
  );
  const rowKey = (model: string, row: SnapshotRow) =>
    JSON.stringify(
      modelMetadata(policies.get(model)!).primaryKey.map(field => row[field])
    );
  const kept = new Map(
    SNAPSHOT_POLICIES.map(policy => [
      policy.model,
      new Set(result[policy.model]!.map(row => rowKey(policy.model, row))),
    ])
  );
  const retain = (model: string, row: SnapshotRow) => {
    const key = rowKey(model, row);
    if (kept.get(model)!.has(key)) return false;
    kept.get(model)!.add(key);
    result[model]!.push(row);
    return true;
  };
  for (const id of [...new Set(protectedTicketIds)].sort()) {
    const row = current.Ticket?.find(ticket => ticket.id === id);
    if (!row) throw new BackupError("RESTORE_PRESERVED_REFERENCE_MISSING");
    retain("Ticket", row);
  }
  const indexed = new Map<string, Map<string, SnapshotRow>>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const policy of SNAPSHOT_POLICIES) {
      for (const relation of modelMetadata(policy).fields) {
        if (
          relation.kind !== "object" ||
          !relation.relationFromFields.length ||
          !policies.has(relation.type)
        )
          continue;
        const target = policies.get(relation.type)!;
        if (target.category !== "OPERATIONAL") continue;
        const sourceKeys = relation.relationFromFields;
        const targetKeys = sourceKeys.map(field => {
          const model = BACKUP_SCHEMA.models.find(
            item => item.name === relation.type
          )!;
          if (
            model.fields.some(
              item => item.kind !== "object" && item.name === field
            )
          )
            return field;
          if (
            field.endsWith("Id") &&
            model.fields.some(item => item.name === "id")
          )
            return "id";
          throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
        });
        const indexKey = `${relation.type}:${targetKeys.join(",")}`;
        let index = indexed.get(indexKey);
        if (!index) {
          index = new Map(
            current[relation.type]!.map(row => [
              JSON.stringify(targetKeys.map(key => row[key])),
              row,
            ])
          );
          indexed.set(indexKey, index);
        }
        for (const row of result[policy.model]!) {
          if (
            sourceKeys.some(key => row[key] === null || row[key] === undefined)
          )
            continue;
          const referenced = index.get(
            JSON.stringify(sourceKeys.map(key => row[key]))
          );
          if (!referenced) throw new BackupError("BACKUP_REFERENCES_INVALID");
          if (retain(relation.type, referenced)) changed = true;
        }
      }
    }
  }
  for (const policy of SNAPSHOT_POLICIES)
    result[policy.model]!.sort((a, b) =>
      rowKey(policy.model, a).localeCompare(rowKey(policy.model, b), "en")
    );
  validateRestoreReferences(result);
  return result;
}
