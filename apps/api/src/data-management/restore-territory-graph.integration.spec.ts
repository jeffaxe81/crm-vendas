import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type { SnapshotData } from "./backup-manifest";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";
import { exportTenantSnapshot } from "./tenant-snapshot";

describe("transactional territory graph restore", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let backups: BackupService;
  let root: string;

  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };
  const transactionOptions = {
    isolationLevel: "RepeatableRead" as const,
    timeout: 60_000,
  };
  const createdAt = "2026-10-01T12:00:00.123456Z";
  const updatedAt = "2026-10-02T12:00:00.654321Z";
  const deletedAt = "2026-10-03T12:00:00.234567Z";
  const lastUpdatedAt = "2026-10-04T15:30:00.345678Z";
  const territoryModels = [
    "Territory",
    "TerritoryQuota",
    "TerritoryTarget",
    "TerritoryMetrics",
  ] as const;

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-territory-"));
    backups = new BackupService(
      runtime,
      new BackupStore({
        directory: root,
        key: randomBytes(32),
        maxBytes: options.maxBytes,
      }),
      options
    );
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
  });

  afterAll(async () => {
    if (owner) {
      await owner.$executeRawUnsafe(
        'TRUNCATE "organizations", "users" CASCADE'
      );
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function identity() {
    const organization = await owner.organization.create({
      data: { name: "Territory restore safety", slug: randomUUID() },
    });
    const email = `territory-restore-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Synthetic territory restore operator",
        passwordHash: "synthetic-territory-original-password",
      },
    });
    const membership = await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    return { organization, user, membership };
  }

  async function createGraph(target: Awaited<ReturnType<typeof identity>>) {
    const organizationId = target.organization.id;
    const userId = target.user.id;
    const authors = { createdBy: userId, updatedBy: userId };
    const company = await owner.company.create({
      data: { organizationId, legalName: "Empresa do território", ...authors },
    });
    const archivedCompany = await owner.company.create({
      data: {
        organizationId,
        legalName: "Empresa histórica",
        deletedAt: new Date(deletedAt),
        deletedBy: userId,
        ...authors,
      },
    });
    const territory = await owner.territory.create({
      data: {
        organizationId,
        name: "Região de vendas",
        region: "Sul",
        description: "Dados sintéticos: 'aspas', ç e 漢字",
        salesRepId: userId,
        version: 5,
        ...authors,
      },
    });
    const archivedTerritory = await owner.territory.create({
      data: {
        organizationId,
        name: "Território histórico sem representante",
        region: "Norte",
        description: null,
        salesRepId: null,
        version: 9,
        deletedAt: new Date(deletedAt),
        deletedBy: userId,
        ...authors,
      },
    });
    // Actual enum values are MONTH/QUARTER/YEAR; zero is a valid legacy index.
    for (const [period, periodIndex] of [
      ["MONTH", 0],
      ["MONTH", 1],
      ["MONTH", 12],
      ["QUARTER", 0],
      ["QUARTER", 4],
      ["YEAR", 0],
    ] as const) {
      await owner.territoryQuota.create({
        data: {
          organizationId,
          territoryId: territory.id,
          period,
          year: 2026,
          periodIndex,
          amount: "99999999999999999.99",
          actual: "9007199254740993.27",
        },
      });
    }
    await owner.territoryQuota.create({
      data: {
        organizationId,
        territoryId: archivedTerritory.id,
        period: "YEAR",
        year: 2000,
        periodIndex: 0,
        amount: "0.01",
        actual: "0.00",
      },
    });
    await owner.territoryTarget.createMany({
      data: [
        {
          organizationId,
          territoryId: territory.id,
          companyId: company.id,
          coverageStatus: "COVERED",
        },
        {
          organizationId,
          territoryId: territory.id,
          companyId: archivedCompany.id,
          coverageStatus: "PARTIAL",
        },
        {
          organizationId,
          territoryId: archivedTerritory.id,
          companyId: company.id,
          coverageStatus: "UNCOVERED",
        },
      ],
    });
    await owner.territoryMetrics.create({
      data: {
        organizationId,
        territoryId: territory.id,
        coveragePercentage: "66.67",
        quotaPercentage: "99.99",
        actualRevenue: "9007199254740995.73",
        targetCount: 3,
        coveredCount: 2,
      },
    });
    await owner.territoryMetrics.create({
      data: {
        organizationId,
        territoryId: archivedTerritory.id,
        coveragePercentage: "0.00",
        quotaPercentage: "123.45",
        actualRevenue: "0.01",
        targetCount: 1,
        coveredCount: 0,
      },
    });

    // Write through PostgreSQL: Prisma Date values retain only milliseconds.
    for (const table of [
      "companies",
      "territories",
      "territory_quotas",
      "territory_targets",
    ]) {
      await owner.$executeRawUnsafe(
        `UPDATE "${table}" SET created_at=$1::timestamptz,
          updated_at=$2::timestamptz WHERE organization_id=$3::uuid`,
        createdAt,
        updatedAt,
        organizationId
      );
    }
    for (const table of ["companies", "territories"]) {
      await owner.$executeRawUnsafe(
        `UPDATE "${table}" SET deleted_at=$1::timestamptz
          WHERE organization_id=$2::uuid AND deleted_at IS NOT NULL`,
        deletedAt,
        organizationId
      );
    }
    await owner.$executeRawUnsafe(
      `UPDATE territory_metrics SET last_updated_at=$1::timestamptz
        WHERE organization_id=$2::uuid`,
      lastUpdatedAt,
      organizationId
    );
    return { company, territory, archivedTerritory };
  }

  async function verifiedBackup(target: Awaited<ReturnType<typeof identity>>) {
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    return backups.verify(target.organization.id, backup.id);
  }

  async function fixture() {
    const target = await identity();
    const graph = await createGraph(target);
    return { ...target, ...graph, verified: await verifiedBackup(target) };
  }

  function snapshotInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string
  ) {
    return exportTenantSnapshot(tx, organizationId, options.maxBytes);
  }

  function snapshot(organizationId: string) {
    return runtime.withTenant(
      organizationId,
      tx => snapshotInTransaction(tx, organizationId),
      transactionOptions
    );
  }

  function restore(organizationId: string, data: SnapshotData) {
    return runtime.withMaintenance(
      organizationId,
      tx => restoreTenantSnapshot(tx, organizationId, data),
      transactionOptions
    );
  }

  async function expectRejectedBeforeDeletion(
    organizationId: string,
    data: SnapshotData
  ) {
    const before = await snapshot(organizationId);
    await runtime.withMaintenance(
      organizationId,
      async tx => {
        await expect(
          restoreTenantSnapshot(tx, organizationId, data)
        ).rejects.toMatchObject({ code: "BACKUP_REFERENCES_INVALID" });
        // Inspect before leaving this transaction: rollback must not conceal a DELETE.
        expect(await snapshotInTransaction(tx, organizationId)).toEqual(before);
      },
      transactionOptions
    );
    expect(await snapshot(organizationId)).toEqual(before);
  }

  it("round-trips territories with exact Decimal strings, period indexes and PostgreSQL microseconds", async () => {
    const target = await fixture();
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);
    const expected = target.verified.data;
    expect(
      expected.Territory!.find(row => row.id === target.territory.id)
    ).toMatchObject({
      salesRepId: target.user.id,
      createdAt,
      updatedAt,
      deletedAt: null,
      version: 5,
    });
    expect(
      expected.Territory!.find(row => row.id === target.archivedTerritory.id)
    ).toMatchObject({
      salesRepId: null,
      description: null,
      deletedAt,
      deletedBy: target.user.id,
      version: 9,
    });
    const quotas = expected.TerritoryQuota!.filter(
      row => row.territoryId === target.territory.id
    );
    expect(quotas.map(row => [row.period, row.periodIndex]).sort()).toEqual([
      ["MONTH", 0],
      ["MONTH", 1],
      ["MONTH", 12],
      ["QUARTER", 0],
      ["QUARTER", 4],
      ["YEAR", 0],
    ]);
    for (const quota of quotas)
      expect(quota).toMatchObject({
        amount: "99999999999999999.99",
        actual: "9007199254740993.27",
        createdAt,
        updatedAt,
      });
    expect(
      expected.TerritoryTarget!.map(row => row.coverageStatus).sort()
    ).toEqual(["COVERED", "PARTIAL", "UNCOVERED"]);
    for (const row of expected.TerritoryTarget!)
      expect(row).toMatchObject({ createdAt, updatedAt });
    expect(
      expected.TerritoryMetrics!.find(
        row => row.territoryId === target.territory.id
      )
    ).toMatchObject({
      coveragePercentage: "66.67",
      quotaPercentage: "99.99",
      actualRevenue: "9007199254740995.73",
      targetCount: 3,
      coveredCount: 2,
      lastUpdatedAt,
    });

    const organizationId = target.organization.id;
    await owner.company.update({
      where: { id: target.company.id },
      data: { legalName: "Empresa alterada" },
    });
    await owner.territory.update({
      where: { id: target.territory.id },
      data: { name: "Território alterado", salesRepId: null, version: 6 },
    });
    await owner.territoryQuota.updateMany({
      where: { organizationId },
      data: { amount: "1.01", actual: "0.00" },
    });
    await owner.territoryTarget.updateMany({
      where: { organizationId },
      data: { coverageStatus: "UNCOVERED" },
    });
    await owner.territoryMetrics.updateMany({
      where: { organizationId },
      data: { actualRevenue: "2.02", quotaPercentage: "3.03" },
    });
    await createGraph(target);
    const currentPassword = "synthetic-territory-password-changed-after-backup";
    await owner.user.update({
      where: { id: target.user.id },
      data: { passwordHash: currentPassword },
    });
    // Change only the excluded privilege bit, retaining the projected timestamps.
    await owner.$executeRawUnsafe(
      "UPDATE organization_memberships SET is_superuser=false WHERE id=$1::uuid",
      target.membership.id
    );

    await restore(organizationId, expected);

    expect(await snapshot(organizationId)).toEqual(expected);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      (await owner.user.findUniqueOrThrow({ where: { id: target.user.id } }))
        .passwordHash
    ).toBe(currentPassword);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: target.membership.id },
        })
      ).isSuperuser
    ).toBe(false);
  });

  it("restores an authentic empty backup after a newer territory graph was added", async () => {
    const target = await identity();
    const verified = await verifiedBackup(target);
    for (const model of territoryModels)
      expect(verified.data[model]).toEqual([]);
    await createGraph(target);
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);

    await restore(target.organization.id, verified.data);

    expect(await snapshot(target.organization.id)).toEqual(verified.data);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  });

  it.each([
    ["TerritoryQuota", "territoryId"],
    ["TerritoryTarget", "territoryId"],
    ["TerritoryMetrics", "territoryId"],
    ["TerritoryTarget", "companyId"],
  ])(
    "rejects a missing %s.%s before any graph deletion",
    async (model, field) => {
      const target = await fixture();
      const broken = structuredClone(target.verified.data);
      broken[model]![0]![field] = randomUUID();

      await expectRejectedBeforeDeletion(target.organization.id, broken);
    }
  );

  it.each([
    ["TerritoryQuota", "territoryId", "Territory"],
    ["TerritoryTarget", "territoryId", "Territory"],
    ["TerritoryMetrics", "territoryId", "Territory"],
    ["TerritoryTarget", "companyId", "Company"],
  ])(
    "rejects another tenant's existing ID in %s.%s before deletion",
    async (model, field, referencedModel) => {
      const target = await fixture();
      const other = await fixture();
      const otherBefore = await snapshot(other.organization.id);
      const broken = structuredClone(target.verified.data);
      broken[model]![0]![field] = other.verified.data[referencedModel]![0]!.id;

      await expectRejectedBeforeDeletion(target.organization.id, broken);
      expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    }
  );

  async function expectConstraintRollback(
    mutate: (data: SnapshotData) => void,
    constraint: string
  ) {
    const target = await fixture();
    const other = await fixture();
    await owner.territory.update({
      where: { id: target.territory.id },
      data: { name: "Estado atual a preservar" },
    });
    await createGraph(target);
    const before = await snapshot(target.organization.id);
    const otherBefore = await snapshot(other.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company![0]!.legalName = "Não persistir empresa";
    broken.Territory![0]!.name = "Não persistir território";
    mutate(broken);

    await expect(restore(target.organization.id, broken)).rejects.toThrow(
      constraint
    );

    expect(await snapshot(target.organization.id)).toEqual(before);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  }

  it.each([
    ["amount", "-0.01", "territory_quotas_amount_check"],
    ["actual", "-0.01", "territory_quotas_actual_check"],
    ["year", 1999, "territory_quotas_year_check"],
    ["periodIndex", 13, "territory_quotas_period_index_check"],
  ] as const)(
    "rolls back the entire graph after a late quota %s constraint failure",
    async (field, value, constraint) => {
      await expectConstraintRollback(data => {
        data.TerritoryQuota!.find(row => row.period === "MONTH")![field] =
          value;
      }, constraint);
    }
  );

  it("rolls back the entire graph after a late quota uniqueness failure", async () => {
    await expectConstraintRollback(data => {
      data.TerritoryQuota!.push({
        ...data.TerritoryQuota![0]!,
        id: randomUUID(),
      });
    }, "territory_quotas_territory_period_year_index_key");
  });
});
