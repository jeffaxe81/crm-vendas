import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";

import { KnowledgeDocumentInputSchema } from "@axes/contracts";
import type {
  KnowledgeStorage,
  KnowledgeStorageInput,
  KnowledgeStoredObject,
} from "./knowledge-storage";

const UUID =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const STORAGE_KEY = new RegExp(
  `^${UUID.source.slice(1, -1)}-${UUID.source.slice(1, -1)}$`,
  "i"
);
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
    // Claim the key with exclusive creation. If a collision occurs, never
    // remove an existing object owned by another knowledge item.
    const handle = await open(target, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await rm(target, { force: true }).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return {
      storageKey,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    // Never follow a symlink supplied by a compromised storage directory.
    const handle = await open(
      this.filePath(storageKey),
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error("KNOWLEDGE_DOCUMENT_SIZE_INVALID");
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  /**
   * Restore an exact immutable object key. Never overwrite an existing key;
   * an identical previously staged blob is safe to reuse after a retry.
   */
  async restore(storageKey: string, bytes: Buffer): Promise<void> {
    const target = this.filePath(storageKey);
    if (bytes.length < 1 || bytes.length > MAX_BYTES)
      throw new Error("KNOWLEDGE_DOCUMENT_SIZE_INVALID");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(target, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await this.get(storageKey);
      if (!existing.equals(bytes))
        throw new Error("KNOWLEDGE_STORAGE_COLLISION");
      return;
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await rm(target, { force: true }).catch(() => undefined);
      throw error;
    }
    await handle.close();
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.filePath(storageKey), { force: true });
  }
}
