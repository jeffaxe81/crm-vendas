import schema from "./backup-schema.json";
import {
  TENANT_DATA_REGISTRY,
  type TenantDataPolicy,
} from "./tenant-data-registry";
export const BACKUP_SCHEMA = schema;
export const SNAPSHOT_POLICIES = TENANT_DATA_REGISTRY.filter(
  policy => policy.export !== "EXCLUDE"
);
export function modelMetadata(policy: TenantDataPolicy) {
  const model = schema.models.find(model => model.name === policy.model);
  if (!model || model.dbName !== policy.table)
    throw Error("BACKUP_SCHEMA_UNSUPPORTED");
  return model;
}
export function snapshotFields(policy: TenantDataPolicy) {
  const fields = modelMetadata(policy).fields.filter(
    field =>
      field.kind !== "object" &&
      (policy.export === "FULL" || policy.fields?.includes(field.name))
  );
  if (policy.export === "PROJECTION" && fields.length !== policy.fields?.length)
    throw Error("BACKUP_SCHEMA_UNSUPPORTED");
  return fields;
}
export function quotedIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
    throw Error("BACKUP_SCHEMA_UNSUPPORTED");
  return `"${value}"`;
}
