import { PrismaService } from "../database/prisma.service";
import { DashboardsService } from "./dashboards.service";

type ModelName = "company" | "contact" | "opportunity" | "activity";
type CountInput = { where: { organizationId: string; deletedAt: null } };

describe("Dashboard volume", () => {
  let counts: Record<ModelName, number>;
  let countCalls: Array<{ model: ModelName; input: CountInput }>;
  let tenantCalls: Array<{ id: string; options: unknown }>;
  let databaseFailure: Error | null;

  function countFor(model: ModelName) {
    return async (input: CountInput): Promise<number> => {
      countCalls.push({ model, input });
      return counts[model];
    };
  }

  const tenant = {
    company: { count: countFor("company") },
    contact: { count: countFor("contact") },
    opportunity: { count: countFor("opportunity") },
    activity: { count: countFor("activity") },
  };

  const withTenant = async (
    id: string,
    callback: (client: typeof tenant) => Promise<unknown>,
    options?: unknown
  ): Promise<unknown> => {
    tenantCalls.push({ id, options });
    if (databaseFailure) {
      const failure = databaseFailure;
      databaseFailure = null;
      throw failure;
    }
    return callback(tenant);
  };

  const service = new DashboardsService({
    withTenant,
  } as unknown as PrismaService);

  beforeEach(() => {
    counts = { company: 1, contact: 2, opportunity: 3, activity: 4 };
    countCalls = [];
    tenantCalls = [];
    databaseFailure = null;
  });

  it("counts only active records in the authenticated tenant", async () => {
    const result = await service.readVolume("tenant-a");
    expect(tenantCalls).toEqual([
      {
        id: "tenant-a",
        options: { isolationLevel: "RepeatableRead" },
      },
    ]);
    expect(countCalls).toEqual(
      (["company", "contact", "opportunity", "activity"] as const).map(
        model => ({
          model,
          input: { where: { organizationId: "tenant-a", deletedAt: null } },
        })
      )
    );
    expect(result.totalActiveRecords).toBe(10);
    expect(result.level).toBe("normal");
    expect(result).not.toHaveProperty("items");
  });

  it("alerts at 800 and 1000 without a write restriction", async () => {
    counts = { company: 800, contact: 0, opportunity: 0, activity: 0 };
    expect((await service.readVolume("tenant-b")).level).toBe("warning");
    counts.company = 1000;
    expect((await service.readVolume("tenant-b")).level).toBe("critical");
  });

  it("rejects malformed tenant context before any transaction", async () => {
    await expect(service.readVolume(" tenant-b ")).rejects.toThrow(
      "INVALID_TENANT_CONTEXT"
    );
    expect(tenantCalls).toHaveLength(0);
  });

  it("does not silently suppress database errors", async () => {
    databaseFailure = new Error("database unavailable");
    await expect(service.readVolume("tenant-c")).rejects.toThrow(
      "database unavailable"
    );
  });
});
