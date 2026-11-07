import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalKnowledgeStorage } from "./local-knowledge-storage";

describe("LocalKnowledgeStorage", () => {
  let root: string;
  const itemId = "00000000-0000-4000-8000-000000000001";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "axe-knowledge-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("persists bytes using an opaque key and round-trips SHA-256", async () => {
    const storage = new LocalKnowledgeStorage(root);
    const bytes = Buffer.from("Contrato de teste");
    const saved = await storage.put(itemId, {
      fileName: "cliente.pdf",
      mimeType: "application/pdf",
      base64: bytes.toString("base64"),
    });
    expect(saved.storageKey).toMatch(
      new RegExp(`^${itemId}-[a-f0-9-]{36}$`)
    );
    expect(saved.storageKey).not.toContain("cliente.pdf");
    expect(saved.sizeBytes).toBe(bytes.length);
    expect(saved.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex")
    );
    expect(await storage.get(saved.storageKey)).toEqual(bytes);
    await storage.remove(saved.storageKey);
    await expect(storage.get(saved.storageKey)).rejects.toThrow();
  });

  it("refuses unsafe keys and invalid input without writing files", async () => {
    const storage = new LocalKnowledgeStorage(root);
    await expect(storage.get("../secret")).rejects.toThrow(
      "KNOWLEDGE_STORAGE_KEY_INVALID"
    );
    await expect(storage.remove("../../secret")).rejects.toThrow(
      "KNOWLEDGE_STORAGE_KEY_INVALID"
    );
    await expect(
      storage.put(randomUUID(), {
        fileName: "../secrets.pdf",
        mimeType: "application/pdf",
        base64: "SGVsbG8=",
      })
    ).rejects.toThrow();
    await expect(
      storage.put(itemId, {
        fileName: "empty.pdf",
        mimeType: "application/pdf",
        base64: "====",
      })
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });

  it("requires an absolute storage root", () => {
    expect(() => new LocalKnowledgeStorage("./data")).toThrow(
      "KNOWLEDGE_STORAGE_ROOT_REQUIRED"
    );
  });
});
