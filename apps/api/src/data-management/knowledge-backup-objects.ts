import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { LocalKnowledgeStorage } from "../knowledge/local-knowledge-storage";
import { BackupError } from "./backup-error";
import {
  validateKnowledgeDocumentBlobs,
  type KnowledgeDocumentBlob,
  type SnapshotData,
} from "./backup-manifest";

/**
 * The same immutable object volume is mounted by the API, backup worker and
 * recovery worker. A backup with documents MUST fail if the volume is missing.
 */
function storage(): LocalKnowledgeStorage {
  const root = process.env.KNOWLEDGE_STORAGE_ROOT;
  if (!root && process.env.NODE_ENV === "production")
    throw new BackupError("BACKUP_ATTACHMENT_ADAPTER_REQUIRED");
  return new LocalKnowledgeStorage(
    root ?? join(tmpdir(), "axes-crm-knowledge-test")
  );
}

/** Capture exact external bytes for rows visible in the same DB snapshot. */
export async function exportKnowledgeDocumentBlobs(
  data: SnapshotData,
  maxBytes: number
): Promise<KnowledgeDocumentBlob[]> {
  const rows = (data.KnowledgeItem ?? []).filter(
    row => row.type === "DOCUMENT"
  );
  if (rows.length === 0) return [];
  const store = storage();
  const blobs: KnowledgeDocumentBlob[] = [];
  let remaining = maxBytes;
  for (const row of rows) {
    if (
      typeof row.storageKey !== "string" ||
      typeof row.sha256 !== "string" ||
      typeof row.sizeBytes !== "string"
    ) throw new BackupError("BACKUP_ATTACHMENT_ADAPTER_REQUIRED");
    // Check the upper bound before reading large external files.
    const expected = Number(row.sizeBytes);
    if (
      !Number.isSafeInteger(expected) ||
      expected <= 0 ||
      expected > 10 * 1024 * 1024 ||
      expected * 4 / 3 > remaining
    ) throw new BackupError("BACKUP_TOO_LARGE");
    let bytes: Buffer;
    try {
      bytes = await store.get(row.storageKey);
    } catch {
      throw new BackupError("BACKUP_ATTACHMENT_ADAPTER_REQUIRED");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== expected || sha256 !== row.sha256)
      throw new BackupError("BACKUP_ATTACHMENT_INTEGRITY_FAILED");
    remaining -= Math.ceil(bytes.length / 3) * 4;
    blobs.push({
      storageKey: row.storageKey,
      sizeBytes: bytes.length,
      sha256,
      base64: bytes.toString("base64"),
    });
  }
  validateKnowledgeDocumentBlobs(data, blobs);
  return blobs;
}

/**
 * Stage exact target bytes before SQL restore. Keys are opaque and unique;
 * an existing file must be byte-for-byte identical and is never overwritten.
 * Failed SQL transactions may leave an orphan staged object, not data loss.
 */
export async function stageKnowledgeDocumentBlobs(
  data: SnapshotData,
  blobs: readonly KnowledgeDocumentBlob[]
): Promise<void> {
  validateKnowledgeDocumentBlobs(data, blobs);
  if (blobs.length === 0) return;
  const store = storage();
  for (const blob of blobs) {
    try {
      await store.restore(blob.storageKey, Buffer.from(blob.base64, "base64"));
    } catch {
      throw new BackupError("BACKUP_ATTACHMENT_RESTORE_FAILED");
    }
  }
}
