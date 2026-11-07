import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalKnowledgeStorage } from "../knowledge/local-knowledge-storage";
import {
  exportKnowledgeDocumentBlobs,
  stageKnowledgeDocumentBlobs,
} from "./knowledge-backup-objects";
import {
  validateKnowledgeDocumentBlobs,
  type SnapshotData,
} from "./backup-manifest";

describe("knowledge object backup and restore adapter", () => {
  let directory: string;
  let previousRoot: string | undefined;
  const itemId = "00000000-0000-4000-8000-000000000001";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "crm-knowledge-backup-"));
    previousRoot = process.env.KNOWLEDGE_STORAGE_ROOT;
    process.env.KNOWLEDGE_STORAGE_ROOT = directory;
  });
  afterEach(async () => {
    if (previousRoot === undefined) delete process.env.KNOWLEDGE_STORAGE_ROOT;
    else process.env.KNOWLEDGE_STORAGE_ROOT = previousRoot;
    await rm(directory, { recursive: true, force: true });
  });

  async function fixture(value = "Contrato assinado") {
    const store = new LocalKnowledgeStorage(directory);
    const bytes = Buffer.from(value);
    const stored = await store.put(itemId, {
      fileName: "contrato.pdf",
      mimeType: "application/pdf",
      base64: bytes.toString("base64"),
    });
    const data: SnapshotData = {
      KnowledgeItem: [
        {
          id: itemId,
          type: "DOCUMENT",
          storageKey: stored.storageKey,
          sizeBytes: String(stored.sizeBytes),
          sha256: stored.sha256,
        },
      ],
    };
    return { data, stored, bytes };
  }

  it("exports exact blob and restores byte-identical files without overwrite", async () => {
    const { data, stored, bytes } = await fixture();
    const blobs = await exportKnowledgeDocumentBlobs(data, 64 * 1024 * 1024);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]).toMatchObject({
      storageKey: stored.storageKey,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    validateKnowledgeDocumentBlobs(data, blobs);
    const store = new LocalKnowledgeStorage(directory);
    await store.remove(stored.storageKey);
    await stageKnowledgeDocumentBlobs(data, blobs);
    expect(await store.get(stored.storageKey)).toEqual(bytes);
    // Idempotent retry is allowed only for exactly the same bytes.
    await stageKnowledgeDocumentBlobs(data, blobs);
    expect(await readdir(directory)).toHaveLength(1);
  });

  it("fails closed on missing, mismatched and untrusted metadata", async () => {
    const { data, stored } = await fixture();
    const blobs = await exportKnowledgeDocumentBlobs(data, 64 * 1024 * 1024);
    const wrong = [{ ...blobs[0]!, base64: "SGVsbG8=" }];
    expect(() => validateKnowledgeDocumentBlobs(data, wrong)).toThrow(
      "BACKUP_INVALID"
    );
    expect(() => validateKnowledgeDocumentBlobs(data, [])).toThrow(
      "BACKUP_ATTACHMENT_ADAPTER_REQUIRED"
    );
    const changed = {
      KnowledgeItem: [{ ...data.KnowledgeItem![0], sha256: "0".repeat(64) }],
    };
    await expect(exportKnowledgeDocumentBlobs(changed, 64 * 1024 * 1024))
      .rejects.toThrow("BACKUP_ATTACHMENT_INTEGRITY_FAILED");
    const store = new LocalKnowledgeStorage(directory);
    await store.remove(stored.storageKey);
    await expect(exportKnowledgeDocumentBlobs(data, 64 * 1024 * 1024))
      .rejects.toThrow("BACKUP_ATTACHMENT_ADAPTER_REQUIRED");
  });

  it("never overwrites an existing blob of different bytes", async () => {
    const { data, stored } = await fixture("original");
    const blobs = await exportKnowledgeDocumentBlobs(data, 64 * 1024 * 1024);
    await expect(
      new LocalKnowledgeStorage(directory).restore(
        stored.storageKey,
        Buffer.from("alterado")
      )
    ).rejects.toThrow("KNOWLEDGE_STORAGE_COLLISION");
    expect((await readFile(join(directory, stored.storageKey))).toString())
      .toBe("original");
    await stageKnowledgeDocumentBlobs(data, blobs);
  });

  it("does not interpret foreign or duplicate keys as local documents", async () => {
    const { data } = await fixture();
    const blobs = await exportKnowledgeDocumentBlobs(data, 64 * 1024 * 1024);
    expect(() => validateKnowledgeDocumentBlobs(data, [...blobs, ...blobs]))
      .toThrow("BACKUP_ATTACHMENT_ADAPTER_REQUIRED");
    const foreign = [{ ...blobs[0]!, storageKey: randomUUID() }];
    expect(() => validateKnowledgeDocumentBlobs(data, foreign))
      .toThrow("BACKUP_INVALID");
  });
});
