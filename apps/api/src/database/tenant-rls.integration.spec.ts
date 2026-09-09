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
    const roles = await prisma.$queryRaw<CurrentRole[]>`
      SELECT rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `;

    expect(roles).toHaveLength(1);

    const role = roles[0];
    if (!role) {
      throw new Error("PostgreSQL current_user role was not found");
    }

    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  it("fails closed for tenant-owned companies when tenant context is missing", async () => {
    const context = await prisma.$queryRaw<
      Array<{ organizationId: string | null }>
    >`
      SELECT nullif(current_setting('app.current_organization_id', true), '') AS "organizationId"
    `;

    expect(context).toEqual([{ organizationId: null }]);

    await expect(prisma.company.findMany()).resolves.toEqual([]);
  });
});
