/** Storage is deliberately separate from Prisma; database rows contain only metadata. */
export const KNOWLEDGE_STORAGE = Symbol("KNOWLEDGE_STORAGE");

export type KnowledgeStorageInput = {
  fileName: string;
  mimeType: string;
  base64: string;
};

export type KnowledgeStoredObject = {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
};

export interface KnowledgeStorage {
  put(
    itemId: string,
    input: KnowledgeStorageInput
  ): Promise<KnowledgeStoredObject>;
  get(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}
