import { PrismaService } from "./prisma.service";

type CurrentRole = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

describe("Tenant RLS integration", () => {
  let prisma: PrismaService;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes:axes@localhost:5432/axes_crm";

    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it("uses an application role that cannot bypass row-level security", async () => {
    const [role] = await prisma.$queryRaw<CurrentRole[]>`
      SELECT rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `;

    expect(role).toBeDefined();
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });
});
