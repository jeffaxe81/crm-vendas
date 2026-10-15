import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import type { PrismaService } from "../database/prisma.service";
import { BackupAdministrationService } from "./backup-administration.service";
import type { BackupService } from "./backup.service";
import type { BackupStore } from "./backup-store";
import type { DataPreviewService } from "./data-preview.service";

describe("backup administration accepts canonical UUID identifiers", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const principal = {
    organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  } as AuthenticatedPrincipal;
  const bytes = Buffer.from("verified synthetic backup");
  const service = new BackupAdministrationService(
    {
      async withTenant(
        _org: string,
        callback: (tx: unknown) => Promise<unknown>
      ) {
        return callback({ auditLog: { async create() {} } });
      },
    } as unknown as PrismaService,
    {
      async verify(_org: string, backupId: string) {
        if (backupId !== id) throw Error("Unexpected backup");
        return { bytes, record: { id } };
      },
    } as unknown as BackupService,
    {
      async previewRestore(
        _principal: AuthenticatedPrincipal,
        backupId: string
      ) {
        return { id: backupId };
      },
    } as unknown as DataPreviewService,
    {} as BackupStore
  );

  it("normalizes the full five-group UUID for preview", async () => {
    await expect(
      service.previewRestore(principal, id.toUpperCase())
    ).resolves.toEqual({ id });
  });
  it("permits download with a valid five-group UUID", async () => {
    await expect(
      service.download(principal, id, "synthetic-request")
    ).resolves.toEqual(bytes);
  });
  it("rejects malformed identifiers", async () => {
    for (const invalid of [
      "aaaaaaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "../backup",
      "",
    ]) {
      await expect(service.previewRestore(principal, invalid)).rejects.toThrow(
        "Identificador de backup inválido."
      );
    }
  });
});
