import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

// Database boundary: verify a total ordering is sent to PostgreSQL for offset pagination.
describe("ActivitiesService pagination contract", () => {
  it.each(["asc", "desc"] as const)(
    "breaks equal deadlines by id for %s pages and retains tenant filters",
    async sortOrder => {
      let captured: any;
      const prisma = {
        withTenant: async (organizationId: string, callback: any) => {
          expect(organizationId).toBe("tenant-a");
          return callback({
            activity: {
              findMany: async (args: any) => {
                captured = args;
                return [];
              },
              count: async () => 101,
            },
          });
        },
      } as unknown as PrismaService;
      const service = new ActivitiesService(prisma, {} as AuditService);
      const result = await service.list(
        {
          page: 2,
          limit: 100,
          sortBy: "dueAt",
          sortOrder,
          status: "PENDING",
          ownerUserId: "owner-a",
          dueTo: "2026-10-03T02:59:59.999Z",
        },
        "tenant-a"
      );
      expect(captured.orderBy).toEqual([{ dueAt: sortOrder }, { id: "asc" }]);
      expect(captured.where).toMatchObject({
        organizationId: "tenant-a",
        deletedAt: null,
        ownerUserId: "owner-a",
        status: "PENDING",
        dueAt: { lte: new Date("2026-10-03T02:59:59.999Z") },
      });
      expect(captured.skip).toBe(100);
      expect(captured.take).toBe(100);
      expect(result).toMatchObject({ page: 2, limit: 100, total: 101 });
    }
  );
});
