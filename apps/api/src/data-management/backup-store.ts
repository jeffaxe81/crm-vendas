import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const MAGIC = Buffer.from("AXESBK01");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES + TAG_BYTES;

export type BackupStoreOptions = {
  directory: string;
  key: Buffer;
  maxBytes: number;
};

/** Private, immutable encrypted objects. Callers supply generated UUIDs, never paths. */
export class BackupStore {
  private readonly key: Buffer;
  private readonly directory: string;
  private readonly maxBytes: number;

  constructor(options: BackupStoreOptions) {
    if (options.key.length !== 32)
      throw new Error("Backup key must contain 32 bytes");
    if (!isAbsolute(options.directory))
      throw new Error("Backup directory must be absolute");
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1)
      throw new Error("Backup size limit must be a positive safe integer");
    this.key = Buffer.from(options.key);
    this.directory = options.directory;
    this.maxBytes = options.maxBytes;
  }

  /**
   * A failure after publication (for example fsync failure) can leave an
   * encrypted object. A catalog must stay pending until this call succeeds;
   * recovery must read and verify the object before retrying or removing it.
   * Object existence alone is never evidence of a completed backup.
   */
  async put(id: string, bytes: Buffer): Promise<void> {
    const objectId = this.objectId(id);
    if (bytes.length > this.maxBytes)
      throw new Error("Backup exceeds configured size limit");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.requireDirectory();
    await chmod(this.directory, 0o700);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(this.aad(objectId));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const envelope = Buffer.concat([
      MAGIC,
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
    const temporary = join(this.directory, `.${objectId}.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(envelope);
        await file.sync();
      } finally {
        await file.close();
      }
      // Atomic publication without overwriting an existing backup. rename() would
      // replace the destination when two workers publish the same object ID.
      await link(temporary, this.path(objectId));
      const directory = await open(this.directory, constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await this.unlinkIfPresent(temporary);
    }
  }

  async read(id: string): Promise<Buffer> {
    const objectId = this.objectId(id);
    await this.requireDirectory();
    const file = await open(
      this.path(objectId),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    let envelope: Buffer;
    try {
      const info = await file.stat();
      if (!info.isFile())
        throw new Error("Backup object must be a regular file");
      if (info.size > this.maxBytes + HEADER_BYTES)
        throw new Error("Backup exceeds configured size limit");
      if (info.size < HEADER_BYTES) throw new Error("Invalid backup envelope");
      // One extra byte detects growth while keeping reads bounded even if the
      // persisted file changes between stat() and read().
      const buffer = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await file.read(
          buffer,
          length,
          buffer.length - length,
          length
        );
        if (result.bytesRead === 0) break;
        length += result.bytesRead;
      }
      if (length !== info.size)
        throw new Error("Backup object changed during read");
      envelope = buffer.subarray(0, length);
    } finally {
      await file.close();
    }
    if (!envelope.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error("Unsupported backup envelope");
    const iv = envelope.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = envelope.subarray(MAGIC.length + IV_BYTES, HEADER_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(this.aad(objectId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(envelope.subarray(HEADER_BYTES)),
      decipher.final(),
    ]);
  }

  async remove(id: string): Promise<void> {
    const objectId = this.objectId(id);
    await this.requireDirectory();
    await this.unlinkIfPresent(this.path(objectId));
  }

  private objectId(id: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      )
    )
      throw new Error("Backup identifier must be a UUID");
    return id.toLowerCase();
  }
  private path(id: string): string {
    return join(this.directory, `${id}.backup`);
  }
  private aad(id: string): Buffer {
    return Buffer.from(`${MAGIC.toString()}:${id}`);
  }
  private async requireDirectory(): Promise<void> {
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Backup directory must be a private directory");
  }
  private async unlinkIfPresent(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
