import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackupStore, BackupStoreIntegrityError } from "./backup-store";

describe("private encrypted backup storage", () => {
  let root: string;
  let key: Buffer;
  let store: BackupStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "axes-backup-test-"));
    key = randomBytes(32);
    store = new BackupStore({ directory: root, key, maxBytes: 1024 });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips encrypted bytes with private permissions and removes only its object", async () => {
    const id = randomUUID();
    const bytes = Buffer.from("synthetic confidential CRM snapshot");
    await store.put(id, bytes);
    expect(await store.read(id)).toEqual(bytes);
    const persisted = await readFile(join(root, `${id}.backup`));
    expect(persisted.includes(bytes)).toBe(false);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, `${id}.backup`))).mode & 0o777).toBe(0o600);
    await store.remove(id);
    await store.remove(id);
    expect(await readdir(root)).toEqual([]);
  });
  it("rejects tampering, a different key, and swapping two object IDs", async () => {
    const id = randomUUID();
    const other = randomUUID();
    await store.put(id, Buffer.from("snapshot"));
    await expect(
      new BackupStore({
        directory: root,
        key: randomBytes(32),
        maxBytes: 1024,
      }).read(id)
    ).rejects.toBeInstanceOf(BackupStoreIntegrityError);
    const encrypted = await readFile(join(root, `${id}.backup`));
    await writeFile(join(root, `${other}.backup`), encrypted);
    await expect(store.read(other)).rejects.toBeInstanceOf(
      BackupStoreIntegrityError
    );
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
    await writeFile(join(root, `${id}.backup`), encrypted);
    await expect(store.read(id)).rejects.toBeInstanceOf(
      BackupStoreIntegrityError
    );
  });
  it("preserves filesystem errors for retry instead of treating them as corrupt bytes", async () => {
    const id = randomUUID();
    await expect(store.read(id)).rejects.toMatchObject({ code: "ENOENT" });
    await chmod(root, 0o755);
    await expect(store.read(id)).rejects.not.toBeInstanceOf(
      BackupStoreIntegrityError
    );
  });
  it("rejects paths, invalid keys and oversized input before publication", async () => {
    expect(
      () =>
        new BackupStore({
          directory: root,
          key: Buffer.alloc(31),
          maxBytes: 1024,
        })
    ).toThrow();
    await expect(store.put("../escape", Buffer.from("x"))).rejects.toThrow();
    await expect(store.read("../escape")).rejects.toThrow();
    await expect(store.remove("../escape")).rejects.toThrow();
    await expect(store.put(randomUUID(), Buffer.alloc(1025))).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
  it("publishes once under concurrency and cleans temporary files", async () => {
    const id = randomUUID();
    const attempts = await Promise.allSettled([
      store.put(id, Buffer.from("first")),
      store.put(id, Buffer.from("second")),
    ]);
    expect(
      attempts.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      attempts.filter(result => result.status === "rejected")
    ).toHaveLength(1);
    expect(["first", "second"]).toContain((await store.read(id)).toString());
    expect(await readdir(root)).toEqual([`${id}.backup`]);
  });
  it("rejects symlinks and oversized persisted files without reading their targets", async () => {
    const id = randomUUID();
    const external = join(root, "external");
    await writeFile(external, "outside");
    await symlink(external, join(root, `${id}.backup`));
    await expect(store.read(id)).rejects.toThrow();
    await store.remove(id);
    expect(await readFile(external, "utf8")).toBe("outside");
    await writeFile(join(root, `${id}.backup`), Buffer.alloc(2048));
    await expect(store.read(id)).rejects.toThrow(
      "Backup exceeds configured size limit"
    );
  });
  it("propagates storage failures and leaves no completed object", async () => {
    const invalidDirectory = join(root, "file");
    await writeFile(invalidDirectory, "not a directory");
    const unavailable = new BackupStore({
      directory: invalidDirectory,
      key,
      maxBytes: 1024,
    });
    await expect(
      unavailable.put(randomUUID(), Buffer.from("snapshot"))
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual(["file"]);
  });
  it("inspects only UUID-named regular objects without reading their contents", async () => {
    const id = randomUUID();
    expect(await store.objectSize(id)).toBeNull();
    await store.put(id, Buffer.from("size-only"));
    const persisted = await stat(join(root, `${id}.backup`));
    expect(await store.objectSize(id)).toBe(persisted.size);
    await expect(store.objectSize("../outside")).rejects.toThrow();
    await store.remove(id);
    expect(await store.objectSize(id)).toBeNull();

    const other = randomUUID();
    const target = join(root, "external");
    await writeFile(target, "do not follow");
    await symlink(target, join(root, `${other}.backup`));
    await expect(store.objectSize(other)).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("do not follow");
  });

  it("rejects an existing shared directory without changing its permissions", async () => {
    await chmod(root, 0o755);
    await expect(
      store.put(randomUUID(), Buffer.from("private snapshot"))
    ).rejects.toThrow("Backup directory must be a private directory");
    expect((await stat(root)).mode & 0o777).toBe(0o755);
    expect(await readdir(root)).toEqual([]);
  });

  it("enumerates recognized objects without following links or exposing unexpected names", async () => {
    const firstId = randomUUID();
    const secondId = randomUUID();
    const linkedId = randomUUID();
    const temporaryObjectId = randomUUID();
    const temporaryAttemptId = randomUUID();

    await store.put(firstId, Buffer.from("first inventory object"));
    await store.put(secondId, Buffer.from("second inventory object"));

    const external = join(root, "unexpected-source");
    await writeFile(external, "do not follow");
    await symlink(external, join(root, `${linkedId}.backup`));

    const temporary = `.${temporaryObjectId}.${temporaryAttemptId}.tmp`;
    await writeFile(join(root, temporary), "temporary");
    await writeFile(join(root, "unexpected-entry.txt"), "unexpected");

    const before = (await readdir(root)).sort();
    const entries = [];
    for await (const entry of store.inventoryEntries()) {
      entries.push(entry);
    }
    const after = (await readdir(root)).sort();

    const firstSize = (await stat(join(root, `${firstId}.backup`))).size;
    const secondSize = (await stat(join(root, `${secondId}.backup`))).size;

    expect(entries).toEqual(
      expect.arrayContaining([
        { kind: "OBJECT", id: firstId.toLowerCase(), size: firstSize },
        { kind: "OBJECT", id: secondId.toLowerCase(), size: secondSize },
        { kind: "UNREADABLE_OBJECT", id: linkedId.toLowerCase() },
        { kind: "TEMPORARY" },
        { kind: "UNEXPECTED" },
      ])
    );
    expect(entries).toHaveLength(6);
    expect(entries.every(entry => !("path" in entry))).toBe(true);
    expect(entries.every(entry => !("name" in entry))).toBe(true);
    expect(after).toEqual(before);
    expect(await readFile(external, "utf8")).toBe("do not follow");
  });

});
