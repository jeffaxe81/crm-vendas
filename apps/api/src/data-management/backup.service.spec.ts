import { BackupService } from "./backup.service";
import { BACKUP_OPTIONS, BACKUP_STORE } from "./backup.service";
import { PrismaService } from "../database/prisma.service";
import { Test } from "@nestjs/testing";
import "reflect-metadata";

describe("backup service disabled configuration", () => {
  it("starts through Nest without compiler-inferred constructor metadata", async () => {
    const metadata = Reflect.getMetadata("design:paramtypes", BackupService);
    Reflect.deleteMetadata("design:paramtypes", BackupService);
    try {
      const database = {
        withTenant() {
          throw Error("Database must not be accessed without storage");
        },
      };
      const module = await Test.createTestingModule({
        providers: [
          { provide: PrismaService, useValue: database },
          { provide: BACKUP_STORE, useValue: null },
          {
            provide: BACKUP_OPTIONS,
            useValue: { maxBytes: 1048576, snapshotTimeoutMs: 60000 },
          },
          BackupService,
        ],
      }).compile();
      try {
        await expect(
          module
            .get(BackupService)
            .create("00000000-0000-0000-0000-000000000001", null, "SCHEDULED")
        ).rejects.toThrow("BACKUP_NOT_CONFIGURED");
      } finally {
        await module.close();
      }
    } finally {
      if (metadata)
        Reflect.defineMetadata("design:paramtypes", metadata, BackupService);
    }
  });
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
