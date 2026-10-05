import { BackupService } from "./backup.service";
import type { PrismaService } from "../database/prisma.service";

describe("backup service disabled configuration", () => {
  it("rejects missing storage before any database access", async () => {
    const database = new Proxy({} as PrismaService, {
      get() {
        throw Error("Database must not be accessed without storage");
      },
    });
    const service = new BackupService(database, null, {
      maxBytes: 1048576,
      snapshotTimeoutMs: 60000,
    });
    await expect(
      service.create("00000000-0000-0000-0000-000000000001", null, "SCHEDULED")
    ).rejects.toThrow("BACKUP_NOT_CONFIGURED");
  });
});
