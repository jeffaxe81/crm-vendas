import { randomBytes, randomUUID } from "node:crypto";
import {
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
import { BackupStore } from "./backup-store";

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
    ).rejects.toThrow();
    const encrypted = await readFile(join(root, `${id}.backup`));
    await writeFile(join(root, `${other}.backup`), encrypted);
    await expect(store.read(other)).rejects.toThrow();
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
    await writeFile(join(root, `${id}.backup`), encrypted);
    await expect(store.read(id)).rejects.toThrow();
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
});
