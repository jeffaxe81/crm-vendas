import { createHash } from "node:crypto";
import { BackupManifestSchema, type BackupManifest } from "@axes/contracts";
import {
  BACKUP_SCHEMA,
  modelMetadata,
  snapshotFields,
  SNAPSHOT_POLICIES,
} from "./backup-models";
import { BackupError } from "./backup-error";
export type SnapshotRow = Record<string, unknown>;
export type SnapshotData = Record<string, SnapshotRow[]>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function invalid(code = "BACKUP_INVALID"): never {
  throw new BackupError(code);
}
export function canonical(value: unknown, depth = 0): string {
  if (depth > 100) invalid();
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(v => canonical(v, depth + 1)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && Object.getPrototypeOf(prototype) !== null)
      invalid();
    return `{${Object.keys(value)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${canonical((value as SnapshotRow)[key], depth + 1)}`
      )
      .join(",")}}`;
  }
  return invalid();
}
const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function snapshotFingerprint(): string {
  return digest(
    SNAPSHOT_POLICIES.map(policy => ({
      policy,
      fields: snapshotFields(policy),
      primaryKey: modelMetadata(policy).primaryKey,
      enums: BACKUP_SCHEMA.enums,
    }))
  );
}
export function referencedUserIds(data: SnapshotData): string[] {
  const ids = new Set<string>();
  for (const policy of SNAPSHOT_POLICIES.filter(p => p.model !== "User")) {
    for (const relation of modelMetadata(policy).fields.filter(
      f => f.kind === "object" && f.type === "User"
    )) {
      for (const row of data[policy.model] ?? [])
        for (const key of relation.relationFromFields) {
          const id = row[key];
          if (id !== null && id !== undefined) {
            if (typeof id !== "string" || !uuid.test(id))
              invalid("BACKUP_REFERENCES_INVALID");
            ids.add(id);
          }
        }
    }
  }
  return [...ids].sort();
}
function exactKeys(value: object, keys: readonly string[]): boolean {
  return canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}
type Field = ReturnType<typeof snapshotFields>[number];
function scalar(value: unknown, field: Field): boolean {
  if (field.kind === "enum")
    return (
      BACKUP_SCHEMA.enums
        .find(e => e.name === field.type)
        ?.values.some(e => e.name === value) ?? false
    );
  switch (field.type) {
    case "String":
      const maxLength = /^VarChar\((\d+)\)$/.exec(field.nativeType ?? "")?.[1];
      return (
        typeof value === "string" &&
        !value.includes("\0") &&
        (!maxLength || Array.from(value).length <= Number(maxLength)) &&
        (field.nativeType !== "Uuid" || uuid.test(value))
      );
    case "Boolean":
      return typeof value === "boolean";
    case "Int":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= (field.nativeType === "SmallInt" ? -32768 : -2147483648) &&
        value <= (field.nativeType === "SmallInt" ? 32767 : 2147483647)
      );
    case "Float":
      return typeof value === "number" && Number.isFinite(value);
    case "BigInt":
      return (
        typeof value === "string" &&
        /^-?\d+$/.test(value) &&
        BigInt(value) >= -(2n ** 63n) &&
        BigInt(value) < 2n ** 63n
      );
    case "Decimal":
      if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))
        return false;
      const decimal = /^Decimal\((\d+),\s*(\d+)\)$/.exec(
        field.nativeType ?? ""
      );
      if (!decimal) return false;
      const [whole = "", fraction = ""] = value.replace(/^-/, "").split(".");
      return (
        whole.replace(/^0+/, "").length <=
          Number(decimal[1]) - Number(decimal[2]) &&
        fraction.length <= Number(decimal[2])
      );
    case "DateTime":
      return (
        typeof value === "string" &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        value.slice(0, 4) !== "0000" &&
        new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
      );
    // Preserve raw PostgreSQL JSON text: parsing and reserializing loses large numeric values.
    case "Json":
      if (typeof value !== "string") return false;
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}
function validField(value: unknown, field: Field): boolean {
  if (value === null) return !field.isRequired;
  if (field.isList)
    return Array.isArray(value) && value.every(v => scalar(v, field));
  return scalar(value, field);
}
function validateData(data: SnapshotData, organizationId: string): void {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !uuid.test(organizationId) ||
    !exactKeys(
      data,
      SNAPSHOT_POLICIES.map(p => p.model)
    )
  )
    invalid();
  for (const policy of SNAPSHOT_POLICIES) {
    const rows = data[policy.model];
    if (!Array.isArray(rows)) invalid();
    const fields = snapshotFields(policy);
    const primaryKey = modelMetadata(policy).primaryKey;
    const keys = new Set<string>();
    for (const row of rows) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        !exactKeys(
          row,
          fields.map(f => f.name)
        )
      )
        invalid();
      for (const field of fields)
        if (!validField(row[field.name], field)) invalid();
      if (
        policy.scope === "ORGANIZATION" &&
        row.organizationId !== organizationId
      )
        invalid("BACKUP_ORGANIZATION_MISMATCH");
      if (policy.scope === "ORGANIZATION_ROOT" && row.id !== organizationId)
        invalid("BACKUP_ORGANIZATION_MISMATCH");
      const pk = canonical(primaryKey.map(key => row[key]));
      if (keys.has(pk)) invalid();
      keys.add(pk);
    }
  }
  if (data.Organization?.length !== 1) invalid();
  if (
    canonical(data.User?.map(row => row.id).sort()) !==
    canonical(referencedUserIds(data))
  )
    invalid("BACKUP_REFERENCES_INVALID");
}
export function encodeSnapshot(
  organizationId: string,
  data: SnapshotData,
  createdAt: Date,
  maxBytes: number
): Buffer {
  validateData(data, organizationId);
  const core = {
    schemaVersion: 1 as const,
    schemaFingerprint: snapshotFingerprint(),
    organizationId,
    createdAt: createdAt.toISOString(),
    counts: Object.fromEntries(
      SNAPSHOT_POLICIES.map(p => [p.model, data[p.model]!.length])
    ),
  };
  const manifest = BackupManifestSchema.parse({
    ...core,
    checksum: digest({ manifest: core, data }),
  });
  const bytes = Buffer.from(canonical({ manifest, data }));
  if (bytes.length > maxBytes) invalid("BACKUP_TOO_LARGE");
  return bytes;
}
export function decodeSnapshot(
  bytes: Buffer,
  organizationId: string,
  maxBytes: number
): { data: SnapshotData; manifest: BackupManifest } {
  if (bytes.length > maxBytes) invalid("BACKUP_TOO_LARGE");
  let document: { manifest: Record<string, unknown>; data: SnapshotData };
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    return invalid();
  }
  if (
    !document ||
    typeof document !== "object" ||
    !exactKeys(document, ["manifest", "data"]) ||
    !document.manifest
  )
    invalid();
  if (document.manifest.schemaVersion !== 1)
    invalid("BACKUP_VERSION_UNSUPPORTED");
  const parsed = BackupManifestSchema.safeParse(document.manifest);
  if (!parsed.success) invalid();
  const manifest = parsed.data;
  if (manifest.organizationId !== organizationId)
    invalid("BACKUP_ORGANIZATION_MISMATCH");
  if (manifest.schemaFingerprint !== snapshotFingerprint())
    invalid("BACKUP_SCHEMA_UNSUPPORTED");
  validateData(document.data, organizationId);
  const counts = Object.fromEntries(
    SNAPSHOT_POLICIES.map(p => [p.model, document.data[p.model]!.length])
  );
  if (canonical(counts) !== canonical(manifest.counts)) invalid();
  const { checksum, ...core } = manifest;
  if (digest({ manifest: core, data: document.data }) !== checksum) invalid();
  return { manifest, data: document.data };
}
