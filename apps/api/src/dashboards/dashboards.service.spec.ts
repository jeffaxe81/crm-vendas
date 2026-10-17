import { jest } from "@jest/globals";

import { PrismaService } from "../database/prisma.service";
import { DashboardsService } from "./dashboards.service";

describe("Dashboard volume", () => {
  const company = { count: jest.fn() };
  const contact = { count: jest.fn() };
  const opportunity = { count: jest.fn() };
  const activity = { count: jest.fn() };
  const withTenant = jest.fn(
    async (_id: string, callback: (tenant: unknown) => Promise<unknown>) =>
      callback({ company, contact, opportunity, activity })
  );
  const service = new DashboardsService({
    withTenant,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    company.count.mockResolvedValue(1);
    contact.count.mockResolvedValue(2);
    opportunity.count.mockResolvedValue(3);
    activity.count.mockResolvedValue(4);
  });

  it("counts only active records in the authenticated tenant", async () => {
    const result = await service.readVolume("tenant-a");
    expect(withTenant).toHaveBeenCalledWith(
      "tenant-a",
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" })
    );
    for (const model of [company, contact, opportunity, activity]) {
      expect(model.count).toHaveBeenCalledWith({
        where: { organizationId: "tenant-a", deletedAt: null },
      });
    }
    expect(result.totalActiveRecords).toBe(10);
    expect(result.level).toBe("normal");
    expect(result).not.toHaveProperty("items");
  });

  it("alerts at 800 and 1000 without a write restriction", async () => {
    company.count.mockResolvedValue(800);
    contact.count.mockResolvedValue(0);
    opportunity.count.mockResolvedValue(0);
    activity.count.mockResolvedValue(0);
    expect((await service.readVolume("tenant-b")).level).toBe("warning");
    company.count.mockResolvedValue(1000);
    expect((await service.readVolume("tenant-b")).level).toBe("critical");
  });

  it("rejects malformed tenant context before any transaction", async () => {
    await expect(service.readVolume(" tenant-b ")).rejects.toThrow(
      "INVALID_TENANT_CONTEXT"
    );
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("does not silently suppress database errors", async () => {
    withTenant.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(service.readVolume("tenant-c")).rejects.toThrow(
      "database unavailable"
    );
  });
});
