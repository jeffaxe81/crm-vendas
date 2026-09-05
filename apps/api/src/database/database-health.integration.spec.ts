import { DatabaseHealthService } from "./database-health.service";
import { PrismaService } from "./prisma.service";

describe("DatabaseHealthService integration", () => {
  let prisma: PrismaService;
  let service: DatabaseHealthService;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes:axes@localhost:5432/axes_crm";

    prisma = new PrismaService();
    service = new DatabaseHealthService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it("confirms PostgreSQL connectivity", async () => {
    await expect(service.isReady()).resolves.toBe(true);
  });
});
