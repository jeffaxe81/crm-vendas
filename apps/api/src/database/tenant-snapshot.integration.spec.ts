import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

describe("Tenant snapshot integration", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes:axes@localhost:5432/axes_crm";

    prisma = new PrismaService();
    admin = new PrismaClient({
      adapter: new PrismaPg({
        connectionString:
          process.env.MIGRATION_DATABASE_URL ??
          "postgresql://axes:axes@localhost:5432/axes_crm",
      }),
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it("keeps a repeatable-read tenant snapshot stable across a concurrent commit", async () => {
    const organizationId = "91000000-0000-4000-8000-000000000001";
    const userId = "92000000-0000-4000-8000-000000000001";
    const companyId = "93000000-0000-4000-8000-000000000001";

    await admin.organization.create({
      data: {
        id: organizationId,
        name: "Snapshot Organization",
        slug: "snapshot-organization",
      },
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "snapshot@example.test",
        emailNormalized: "snapshot@example.test",
        displayName: "Snapshot User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.company.create({
      data: {
        id: companyId,
        organizationId,
        legalName: "Snapshot Before",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    let firstReadReady!: () => void;
    let updateCommitted!: () => void;
    const firstReadReached = new Promise<void>(resolve => {
      firstReadReady = resolve;
    });
    const updateFinished = new Promise<void>(resolve => {
      updateCommitted = resolve;
    });

    const transaction = prisma.withTenant(
      organizationId,
      async tenant => {
        const firstRead = await tenant.company.findUniqueOrThrow({
          where: { id: companyId },
          select: { legalName: true },
        });
        firstReadReady();
        await updateFinished;
        const secondRead = await tenant.company.findUniqueOrThrow({
          where: { id: companyId },
          select: { legalName: true },
        });
        return { firstRead, secondRead };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );

    await firstReadReached;
    await admin.company.update({
      where: { id: companyId },
      data: { legalName: "Snapshot After" },
    });
    updateCommitted();

    const reads = await transaction;
    expect(reads.secondRead).toEqual(reads.firstRead);

    const readAfterCommit = await prisma.withTenant(organizationId, tenant =>
      tenant.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { legalName: true },
      })
    );
    expect(readAfterCommit.legalName).toBe("Snapshot After");
    expect(readAfterCommit).not.toEqual(reads.firstRead);
  });
});
