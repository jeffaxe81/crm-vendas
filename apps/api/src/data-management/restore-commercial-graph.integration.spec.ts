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

describe("transactional commercial graph restore", () => {
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
  const expectedCloseAt = "2026-11-01T15:30:00.345678Z";
  const dueAt = "2026-10-02T13:00:00.456789Z";
  const completedAt = "2026-10-02T14:00:00.567891Z";
  const cancelledAt = "2026-10-02T14:30:00.678912Z";

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-commercial-"));
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
      data: { name: "Commercial restore safety", slug: randomUUID() },
    });
    const email = `commercial-restore-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Synthetic commercial restore operator",
        passwordHash: "synthetic-commercial-original-password",
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
      data: { organizationId, legalName: "Empresa de teste", ...authors },
    });
    const contact = await owner.contact.create({
      data: {
        organizationId,
        fullName: "Contato de teste",
        notes: "Dados sintéticos: 'aspas', ç e 漢字",
        ...authors,
      },
    });
    await owner.contactChannel.create({
      data: {
        organizationId,
        contactId: contact.id,
        type: "EMAIL",
        value: "synthetic-commercial@example.test",
        isPrimary: true,
      },
    });
    await owner.companyContact.create({
      data: {
        organizationId,
        companyId: company.id,
        contactId: contact.id,
        relationshipLabel: "Comprador",
        isPrimary: true,
      },
    });
    await owner.relationshipEntry.create({
      data: {
        organizationId,
        companyId: company.id,
        contactId: contact.id,
        authorUserId: userId,
        kind: "MEETING_NOTE",
        content: "Anotação sintética anterior ao backup",
        occurredAt: new Date("2026-10-01T09:00:00Z"),
      },
    });
    const tag = await owner.tag.create({
      data: { organizationId, name: "Comercial", normalizedName: "comercial" },
    });
    await owner.companyTag.create({
      data: { organizationId, companyId: company.id, tagId: tag.id },
    });
    await owner.contactTag.create({
      data: { organizationId, contactId: contact.id, tagId: tag.id },
    });
    const pipeline = await owner.pipeline.create({
      data: {
        organizationId,
        name: "Funil de vendas",
        normalizedName: "vendas",
      },
    });
    const stage = await owner.pipelineStage.create({
      data: {
        organizationId,
        pipelineId: pipeline.id,
        name: "Negociação",
        position: 1,
        kind: "OPEN",
      },
    });
    const wonStage = await owner.pipelineStage.create({
      data: {
        organizationId,
        pipelineId: pipeline.id,
        name: "Ganho",
        position: 2,
        kind: "WON",
      },
    });
    const product = await owner.product.create({
      data: {
        organizationId,
        code: "MED-001",
        name: "Produto de alto valor",
        description: "Preço exato, acima de Number.MAX_SAFE_INTEGER",
        unitPrice: "9007199254740993.27",
        version: 5,
        ...authors,
      },
    });
    const archivedProduct = await owner.product.create({
      data: {
        organizationId,
        code: "med-001",
        name: "Produto histórico com o mesmo código",
        description: null,
        unitPrice: "0.01",
        isActive: false,
        version: 9,
        deletedAt: new Date(deletedAt),
        deletedBy: userId,
        ...authors,
      },
    });
    // The database requires exactly one customer: cover both FK variants.
    const opportunity = await owner.opportunity.create({
      data: {
        organizationId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        companyId: company.id,
        ownerUserId: userId,
        title: "Oportunidade da empresa",
        estimatedValue: "9007199254740995.73",
        expectedCloseAt: new Date(expectedCloseAt),
        notes: "Condições sintéticas: 'à vista' e 漢字",
        version: 7,
        deletedAt: new Date(deletedAt),
        deletedBy: userId,
        ...authors,
      },
    });
    const contactOpportunity = await owner.opportunity.create({
      data: {
        organizationId,
        pipelineId: pipeline.id,
        stageId: wonStage.id,
        contactId: contact.id,
        ownerUserId: userId,
        title: "Oportunidade do contato",
        estimatedValue: "0.00",
        ...authors,
      },
    });
    const item = await owner.opportunityItem.create({
      data: {
        organizationId,
        opportunityId: opportunity.id,
        productId: product.id,
        description: "Preço histórico independente do catálogo",
        quantity: "1.001",
        unitPrice: "9007199254740993.27",
        discountPercent: "0.00",
        lineTotal: "9016206453995734.26",
        ...authors,
      },
    });
    const fractionalItem = await owner.opportunityItem.create({
      data: {
        organizationId,
        opportunityId: contactOpportunity.id,
        productId: archivedProduct.id,
        description: "Quantidade com três casas decimais",
        quantity: "123456789.123",
        unitPrice: "0.01",
        discountPercent: "12.34",
        lineTotal: "1082222.21",
        ...authors,
      },
    });
    const activity = await owner.activity.create({
      data: {
        organizationId,
        type: "APPOINTMENT",
        status: "COMPLETED",
        priority: "HIGH",
        title: "Reunião vinculada à oportunidade",
        description: "Descrição sintética com 'aspas'",
        companyId: company.id,
        contactId: contact.id,
        opportunityId: opportunity.id,
        ownerUserId: userId,
        dueAt: new Date(dueAt),
        completedAt: new Date(completedAt),
        deletedAt: new Date(deletedAt),
        deletedBy: userId,
        ...authors,
      },
    });
    const cancelledActivity = await owner.activity.create({
      data: {
        organizationId,
        type: "TASK",
        status: "CANCELLED",
        priority: "LOW",
        title: "Tarefa sem vínculo opcional",
        ownerUserId: userId,
        cancelledAt: new Date(cancelledAt),
        ...authors,
      },
    });

    // Prisma Date values only retain milliseconds; write the PostgreSQL fixture
    // directly so a Date/Number conversion in restore is observable.
    for (const table of [
      "products",
      "opportunities",
      "opportunity_items",
      "activities",
    ]) {
      await owner.$executeRawUnsafe(
        `UPDATE "${table}" SET created_at=$1::timestamptz,
          updated_at=$2::timestamptz WHERE organization_id=$3::uuid`,
        createdAt,
        updatedAt,
        organizationId
      );
    }
    for (const table of ["products", "opportunities", "activities"]) {
      await owner.$executeRawUnsafe(
        `UPDATE "${table}" SET deleted_at=$1::timestamptz
          WHERE organization_id=$2::uuid AND deleted_at IS NOT NULL`,
        deletedAt,
        organizationId
      );
    }
    await owner.$executeRawUnsafe(
      `UPDATE opportunities SET expected_close_at=$1::timestamptz
        WHERE id=$2::uuid`,
      expectedCloseAt,
      opportunity.id
    );
    await owner.$executeRawUnsafe(
      `UPDATE activities SET due_at=$1::timestamptz,
        completed_at=$2::timestamptz WHERE id=$3::uuid`,
      dueAt,
      completedAt,
      activity.id
    );
    await owner.$executeRawUnsafe(
      `UPDATE activities SET cancelled_at=$1::timestamptz WHERE id=$2::uuid`,
      cancelledAt,
      cancelledActivity.id
    );
    return {
      company,
      contact,
      tag,
      pipeline,
      stage,
      product,
      opportunity,
      contactOpportunity,
      item,
      fractionalItem,
      activity,
      cancelledActivity,
    };
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
    data: SnapshotData,
    code: string
  ) {
    const before = await snapshot(organizationId);
    await runtime.withMaintenance(
      organizationId,
      async tx => {
        await expect(
          restoreTenantSnapshot(tx, organizationId, data)
        ).rejects.toMatchObject({ code });
        // Inspect the same transaction before rollback could hide a DELETE.
        expect(await snapshotInTransaction(tx, organizationId)).toEqual(before);
      },
      transactionOptions
    );
    expect(await snapshot(organizationId)).toEqual(before);
  }

  it("round-trips the commercial graph with exact Decimal strings and PostgreSQL microseconds", async () => {
    const target = await fixture();
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);
    const expected = target.verified.data;
    expect(
      expected.Product!.find(row => row.id === target.product.id)
    ).toMatchObject({
      unitPrice: "9007199254740993.27",
      createdAt,
      updatedAt,
      deletedAt: null,
      version: 5,
    });
    expect(
      expected.Opportunity!.find(row => row.id === target.opportunity.id)
    ).toMatchObject({
      estimatedValue: "9007199254740995.73",
      expectedCloseAt,
      deletedAt,
      contactId: null,
      version: 7,
    });
    expect(
      expected.OpportunityItem!.find(row => row.id === target.item.id)
    ).toMatchObject({
      quantity: "1.001",
      unitPrice: "9007199254740993.27",
      discountPercent: "0.00",
      lineTotal: "9016206453995734.26",
      createdAt,
      updatedAt,
    });
    expect(
      expected.OpportunityItem!.find(row => row.id === target.fractionalItem.id)
    ).toMatchObject({
      quantity: "123456789.123",
      discountPercent: "12.34",
    });
    expect(
      expected.Activity!.find(row => row.id === target.activity.id)
    ).toMatchObject({
      opportunityId: target.opportunity.id,
      dueAt,
      completedAt,
      cancelledAt: null,
      deletedAt,
      createdAt,
      updatedAt,
    });
    expect(
      expected.Activity!.find(row => row.id === target.cancelledActivity.id)
    ).toMatchObject({
      opportunityId: null,
      cancelledAt,
    });

    await owner.company.update({
      where: { id: target.company.id },
      data: { legalName: "Empresa alterada depois do backup" },
    });
    await owner.contact.update({
      where: { id: target.contact.id },
      data: { fullName: "Contato alterado" },
    });
    await owner.tag.update({
      where: { id: target.tag.id },
      data: { name: "Etiqueta alterada" },
    });
    await owner.pipelineStage.update({
      where: { id: target.stage.id },
      data: { name: "Etapa alterada" },
    });
    await owner.product.update({
      where: { id: target.product.id },
      data: { name: "Produto alterado", unitPrice: "1.01", version: 6 },
    });
    await owner.opportunity.update({
      where: { id: target.opportunity.id },
      data: { title: "Oportunidade alterada", estimatedValue: "2.02" },
    });
    await owner.opportunityItem.update({
      where: { id: target.item.id },
      data: {
        description: "Item alterado",
        quantity: "2.002",
        lineTotal: "3.03",
      },
    });
    await owner.activity.update({
      where: { id: target.activity.id },
      data: {
        title: "Atividade alterada",
        completedAt: null,
        status: "PENDING",
      },
    });
    const organizationId = target.organization.id;
    const authors = { createdBy: target.user.id, updatedBy: target.user.id };
    const newerProduct = await owner.product.create({
      data: {
        organizationId,
        code: "NEW-AFTER-BACKUP",
        name: "Produto posterior",
        unitPrice: "4.04",
        ...authors,
      },
    });
    const newerOpportunity = await owner.opportunity.create({
      data: {
        organizationId,
        pipelineId: target.pipeline.id,
        stageId: target.stage.id,
        companyId: target.company.id,
        ownerUserId: target.user.id,
        title: "Oportunidade posterior",
        estimatedValue: "5.05",
        ...authors,
      },
    });
    await owner.opportunityItem.create({
      data: {
        organizationId,
        opportunityId: newerOpportunity.id,
        productId: newerProduct.id,
        description: "Item posterior",
        quantity: "1.000",
        unitPrice: "4.04",
        lineTotal: "4.04",
        ...authors,
      },
    });
    await owner.activity.create({
      data: {
        organizationId,
        type: "TASK",
        title: "Atividade posterior",
        opportunityId: newerOpportunity.id,
        ownerUserId: target.user.id,
        ...authors,
      },
    });
    const currentPassword =
      "synthetic-commercial-password-changed-after-backup";
    await owner.user.update({
      where: { id: target.user.id },
      data: { passwordHash: currentPassword },
    });

    await restore(organizationId, target.verified.data);

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
    ).toBe(true);
  });

  it("restores an authentic empty backup after a newer commercial graph was added", async () => {
    const target = await identity();
    const verified = await verifiedBackup(target);
    for (const model of [
      "Product",
      "Opportunity",
      "OpportunityItem",
      "Activity",
    ])
      expect(verified.data[model]).toEqual([]);
    await createGraph(target);
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);

    await restore(target.organization.id, verified.data);

    expect(await snapshot(target.organization.id)).toEqual(verified.data);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: target.membership.id },
        })
      ).isSuperuser
    ).toBe(true);
  });

  async function removeHistoricalOwnerMembership(
    target: Awaited<ReturnType<typeof fixture>>
  ) {
    const replacement = await identity();
    await owner.organizationMembership.create({
      data: {
        organizationId: target.organization.id,
        userId: replacement.user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    await owner.opportunity.updateMany({
      where: { organizationId: target.organization.id },
      data: { ownerUserId: replacement.user.id },
    });
    await owner.organizationMembership.delete({
      where: { id: target.membership.id },
    });
  }

  it("rejects a removed historical owner's membership before deleting any graph rows", async () => {
    const target = await fixture();
    await removeHistoricalOwnerMembership(target);
    expect(
      await owner.user.findUnique({ where: { id: target.user.id } })
    ).not.toBeNull();
    await expectRejectedBeforeDeletion(
      target.organization.id,
      target.verified.data,
      "RESTORE_MEMBERSHIP_REFERENCE_MISSING"
    );
  });

  it("restores ownership through a recreated membership without restoring its historical privileges", async () => {
    const target = await fixture();
    await removeHistoricalOwnerMembership(target);
    const currentMembership = await owner.organizationMembership.create({
      data: {
        organizationId: target.organization.id,
        userId: target.user.id,
        role: "ADMIN",
        isSuperuser: false,
      },
    });
    expect(currentMembership.id).not.toBe(target.membership.id);
    const before = await snapshot(target.organization.id);

    await restore(target.organization.id, target.verified.data);

    const after = await snapshot(target.organization.id);
    for (const model of [
      "Company",
      "Contact",
      "ContactChannel",
      "CompanyContact",
      "RelationshipEntry",
      "Tag",
      "CompanyTag",
      "ContactTag",
      "Pipeline",
      "PipelineStage",
      "Product",
      "Opportunity",
      "OpportunityItem",
      "Activity",
    ]) {
      expect(after[model]).toEqual(target.verified.data[model]);
    }
    expect(after.OrganizationMembership).toEqual(before.OrganizationMembership);
    expect(
      await owner.organizationMembership.findUnique({
        where: { id: currentMembership.id },
      })
    ).toMatchObject({ userId: target.user.id, isSuperuser: false });
  });

  it.each([
    ["Opportunity", "pipelineId"],
    ["Opportunity", "stageId"],
    ["OpportunityItem", "opportunityId"],
    ["OpportunityItem", "productId"],
    ["Activity", "opportunityId"],
  ])(
    "rejects a missing %s.%s before any graph deletion",
    async (model, field) => {
      const target = await fixture();
      const broken = structuredClone(target.verified.data);
      broken[model]![0]![field] = randomUUID();

      await expectRejectedBeforeDeletion(
        target.organization.id,
        broken,
        "BACKUP_REFERENCES_INVALID"
      );
    }
  );

  it.each([
    ["Opportunity", "stageId", "PipelineStage"],
    ["OpportunityItem", "productId", "Product"],
    ["Activity", "opportunityId", "Opportunity"],
  ])(
    "rejects another tenant's existing ID in %s.%s before deletion",
    async (model, field, referencedModel) => {
      const target = await fixture();
      const other = await fixture();
      const otherBefore = await snapshot(other.organization.id);
      const broken = structuredClone(target.verified.data);
      broken[model]![0]![field] = other.verified.data[referencedModel]![0]!.id;

      await expectRejectedBeforeDeletion(
        target.organization.id,
        broken,
        "BACKUP_REFERENCES_INVALID"
      );
      expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    }
  );

  it("rolls back the entire graph when an opportunity item fails its late quantity check", async () => {
    const target = await fixture();
    const other = await fixture();
    await owner.activity.update({
      where: { id: target.activity.id },
      data: { title: "Estado atual a preservar no rollback" },
    });
    const before = await snapshot(target.organization.id);
    const otherBefore = await snapshot(other.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company![0]!.legalName = "Não persistir empresa";
    broken.Contact![0]!.fullName = "Não persistir contato";
    broken.Product![0]!.name = "Não persistir produto";
    broken.Opportunity![0]!.title = "Não persistir oportunidade";
    broken.OpportunityItem![0]!.quantity = "0.000";

    await expect(restore(target.organization.id, broken)).rejects.toThrow(
      "opportunity_items_quantity_check"
    );

    expect(await snapshot(target.organization.id)).toEqual(before);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  });

  it.each(["current", "target"] as const)(
    "restores supported Ticket rows present only in the %s graph",
    async location => {
      const target = await identity();
      const company = await owner.company.create({
        data: {
          organizationId: target.organization.id,
          legalName: "Empresa anterior ao backup",
          createdBy: target.user.id,
          updatedBy: target.user.id,
        },
      });
      async function createTicket() {
        return owner.ticket.create({
          data: {
            organizationId: target.organization.id,
            protocol: "2026-000001",
            subject: "Ticket comercial restaurável",
            companyId: company.id,
            createdBy: target.user.id,
            updatedBy: target.user.id,
          },
        });
      }
      const historicalTicket =
        location === "target" ? await createTicket() : null;
      const verified = await verifiedBackup(target);
      if (historicalTicket)
        await owner.ticket.delete({ where: { id: historicalTicket.id } });
      if (location === "current") await createTicket();
      await owner.company.update({
        where: { id: company.id },
        data: { legalName: "Estado atual a substituir" },
      });

      await restore(target.organization.id, verified.data);

      expect(await snapshot(target.organization.id)).toEqual(verified.data);
    }
  );

});
