import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { KnowledgeDocumentInputSchema } from "@axes/contracts";
import type {
  KnowledgeStorage,
  KnowledgeStorageInput,
  KnowledgeStoredObject,
} from "./knowledge-storage";

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const STORAGE_KEY = new RegExp(`^${UUID.source.slice(1, -1)}-${UUID.source.slice(1, -1)}$`, "i");
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Storage keys are generated server-side and never contain client-provided
 * filenames. The directory must be persisted and included in the backup plan.
 */
export class LocalKnowledgeStorage implements KnowledgeStorage {
  constructor(private readonly root: string) {
    if (!isAbsolute(root)) {
      throw new Error("KNOWLEDGE_STORAGE_ROOT_REQUIRED");
    }
  }

  private filePath(storageKey: string): string {
    if (!STORAGE_KEY.test(storageKey)) {
      throw new Error("KNOWLEDGE_STORAGE_KEY_INVALID");
    }
    return join(this.root, storageKey);
  }

  async put(
    itemId: string,
    input: KnowledgeStorageInput
  ): Promise<KnowledgeStoredObject> {
    if (!UUID.test(itemId)) {
      throw new Error("KNOWLEDGE_ITEM_ID_INVALID");
    }
    const parsed = KnowledgeDocumentInputSchema.parse(input);
    const bytes = Buffer.from(parsed.base64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      throw new Error("KNOWLEDGE_DOCUMENT_SIZE_INVALID");
    }

    const storageKey = `${itemId}-${randomUUID()}`;
    const target = this.filePath(storageKey);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try {
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      await rm(target, { force: true }).catch(() => undefined);
      throw error;
    }
    return {
      storageKey,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.filePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.filePath(storageKey), { force: true });
  }
}
