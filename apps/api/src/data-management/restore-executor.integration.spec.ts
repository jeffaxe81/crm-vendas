import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";
import { exportTenantSnapshot } from "./tenant-snapshot";

describe("transactional tenant restore executor", () => {
  let owner: PrismaService;
  let runtime: PrismaService;
  let backups: BackupService;
  let root: string;

  const passwords = new PasswordService();
  const options = { maxBytes: 8_388_608, snapshotTimeoutMs: 60_000 };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }

    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-executor-"));
    const store = new BackupStore({
      directory: root,
      key: randomBytes(32),
      maxBytes: options.maxBytes,
    });
    backups = new BackupService(runtime, store, options);
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

  async function fixture(empty = false) {
    const organization = await owner.organization.create({
      data: { name: "Executor safety test", slug: randomUUID() },
    });
    const email = `restore-safety-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Restore safety operator",
        passwordHash: "synthetic-restore-safety-hash",
      },
    });
    await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });
    if (!empty) {
      await owner.company.create({
        data: {
          organizationId: organization.id,
          legalName: "Current company",
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    }
    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);
    return { organization, user, verified };
  }

  async function companies(organizationId: string) {
    return runtime.withTenant(organizationId, tx =>
      tx.company.findMany({ where: { organizationId }, orderBy: { id: "asc" } })
    );
  }

  async function contactGraph() {
    const target = await fixture();
    const company = (await companies(target.organization.id))[0]!;
    const contact = await owner.contact.create({
      data: {
        organizationId: target.organization.id,
        fullName: "Contato de homologação",
        jobTitle: "Enfermagem",
        notes: "Dados sintéticos: 'aspas', ç e 漢字",
        createdBy: target.user.id,
        updatedBy: target.user.id,
        version: 7,
        deletedAt: new Date("2026-10-01T10:00:00Z"),
        deletedBy: target.user.id,
      },
    });
    await owner.contactChannel.createMany({
      data: [
        {
          organizationId: target.organization.id,
          contactId: contact.id,
          type: "EMAIL",
          value: "synthetic@example.test",
          label: "Trabalho",
          isPrimary: true,
        },
        {
          organizationId: target.organization.id,
          contactId: contact.id,
          type: "PHONE",
          value: "+55 48 0000-0000",
          label: null,
          isPrimary: false,
        },
      ],
    });
    await owner.companyContact.create({
      data: {
        organizationId: target.organization.id,
        companyId: company.id,
        contactId: contact.id,
        relationshipLabel: "Responsável técnico",
        isPrimary: true,
      },
    });
    await owner.relationshipEntry.createMany({
      data: [
        {
          organizationId: target.organization.id,
          companyId: company.id,
          contactId: contact.id,
          authorUserId: target.user.id,
          kind: "CALL_NOTE",
          content: "Ligação de teste",
          occurredAt: new Date("2026-10-02T15:00:00Z"),
        },
        {
          organizationId: target.organization.id,
          contactId: contact.id,
          authorUserId: target.user.id,
          kind: "NOTE",
          content: "Anotação sem empresa",
          occurredAt: new Date("2026-10-03T15:00:00Z"),
        },
      ],
    });
    await owner.$executeRawUnsafe(
      `UPDATE companies SET created_at='2026-10-01T12:00:00.123456Z',
        updated_at='2026-10-02T12:00:00.654321Z' WHERE id=$1::uuid`,
      company.id
    );
    await owner.$executeRawUnsafe(
      `UPDATE contacts SET created_at='2026-10-01T12:00:00.234567Z',
        updated_at='2026-10-02T12:00:00.765432Z' WHERE id=$1::uuid`,
      contact.id
    );
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    return {
      ...target,
      company,
      contact,
      verified: await backups.verify(target.organization.id, backup.id),
    };
  }

  async function tagGraph() {
    const target = await contactGraph();
    const tag = await owner.tag.create({
      data: {
        organizationId: target.organization.id,
        name: "Prioridade",
        normalizedName: "prioridade",
      },
    });
    await owner.companyTag.create({
      data: {
        organizationId: target.organization.id,
        companyId: target.company.id,
        tagId: tag.id,
      },
    });
    await owner.contactTag.create({
      data: {
        organizationId: target.organization.id,
        contactId: target.contact.id,
        tagId: tag.id,
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    return {
      ...target,
      tag,
      verified: await backups.verify(target.organization.id, backup.id),
    };
  }

  async function pipelineGraph() {
    const target = await fixture();
    const pipeline = await owner.pipeline.create({
      data: {
        organizationId: target.organization.id,
        name: "Funil comercial",
        normalizedName: "funil-comercial",
      },
    });
    const first = await owner.pipelineStage.create({
      data: {
        organizationId: target.organization.id,
        pipelineId: pipeline.id,
        name: "Em contato",
        position: 1,
        kind: "OPEN",
      },
    });
    const second = await owner.pipelineStage.create({
      data: {
        organizationId: target.organization.id,
        pipelineId: pipeline.id,
        name: "Concluído",
        position: 2,
        kind: "WON",
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    return {
      ...target,
      pipeline,
      first,
      second,
      verified: await backups.verify(target.organization.id, backup.id),
    };
  }

  async function roleGraph() {
    const target = await fixture();
    const role = await owner.role.create({
      data: {
        organizationId: target.organization.id,
        code: "TEAM_REPORTS",
        name: "Equipe de relatórios",
        isSystem: false,
      },
    });
    const permission = await owner.rolePermission.create({
      data: {
        organizationId: target.organization.id,
        roleId: role.id,
        permission: "reports.read",
        scope: "ORGANIZATION",
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    return {
      ...target,
      role,
      permission,
      verified: await backups.verify(target.organization.id, backup.id),
    };
  }

  async function graphSnapshot(organizationId: string) {
    const data = await runtime.withTenant(
      organizationId,
      tx => exportTenantSnapshot(tx, organizationId, options.maxBytes),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );
    return Object.fromEntries(
      [
        "Role",
        "RolePermission",
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
      ].map(model => [model, data[model]])
    );
  }

  it("round-trips tenant roles and permissions while preserving another tenant", async () => {
    const target = await roleGraph();
    const other = await roleGraph();
    const expected = await graphSnapshot(target.organization.id);
    const otherBefore = await graphSnapshot(other.organization.id);

    await owner.role.update({
      where: { id: target.role.id },
      data: { name: "Modified after backup" },
    });
    await owner.rolePermission.delete({ where: { id: target.permission.id } });
    await owner.rolePermission.create({
      data: {
        organizationId: target.organization.id,
        roleId: target.role.id,
        permission: "contacts.read",
      },
    });
    await owner.role.create({
      data: {
        organizationId: target.organization.id,
        code: "CREATED_AFTER_BACKUP",
        name: "Should be removed",
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(
          tx,
          target.organization.id,
          target.verified.data
        ),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );
    expect(await graphSnapshot(target.organization.id)).toEqual(expected);
    expect(await graphSnapshot(other.organization.id)).toEqual(otherBefore);
  });

  it("removes tenant roles created after an empty role backup", async () => {
    const target = await fixture();
    const other = await roleGraph();
    const otherBefore = await graphSnapshot(other.organization.id);
    const role = await owner.role.create({
      data: {
        organizationId: target.organization.id,
        code: "AFTER_BACKUP",
        name: "Newer role",
      },
    });
    await owner.rolePermission.create({
      data: {
        organizationId: target.organization.id,
        roleId: role.id,
        permission: "reports.read",
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(
          tx,
          target.organization.id,
          target.verified.data
        ),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );
    const restored = await graphSnapshot(target.organization.id);
    expect(restored.Role).toEqual([]);
    expect(restored.RolePermission).toEqual([]);
    expect(await graphSnapshot(other.organization.id)).toEqual(otherBefore);
  });

  it("rejects a role permission targeting a role missing from the snapshot", async () => {
    const target = await roleGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.RolePermission![0]!.roleId = randomUUID();

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("BACKUP_REFERENCES_INVALID");
    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("rejects a role permission referencing another tenant's role", async () => {
    const target = await roleGraph();
    const other = await roleGraph();
    const before = await graphSnapshot(target.organization.id);
    const otherBefore = await graphSnapshot(other.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.RolePermission![0]!.roleId = other.role.id;

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("BACKUP_REFERENCES_INVALID");
    expect(await graphSnapshot(target.organization.id)).toEqual(before);
    expect(await graphSnapshot(other.organization.id)).toEqual(otherBefore);
  });

  it("rolls back role changes if a duplicate permission violates uniqueness", async () => {
    const target = await roleGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Role![0]!.name = "Should be rolled back";
    broken.RolePermission!.push({
      ...broken.RolePermission![0]!,
      id: randomUUID(),
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow(/23505|Unique constraint|duplicate key/);
    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("round-trips contacts, channels, company links and notes with exact timestamp precision", async () => {
    const target = await contactGraph();
    const other = await contactGraph();
    const expected = await graphSnapshot(target.organization.id);
    const otherBefore = await graphSnapshot(other.organization.id);
    await owner.contact.update({
      where: { id: target.contact.id },
      data: { fullName: "Alterado depois do backup", notes: null },
    });
    await owner.contactChannel.updateMany({
      where: { organizationId: target.organization.id },
      data: { label: "Alterado" },
    });
    await owner.companyContact.updateMany({
      where: { organizationId: target.organization.id },
      data: { relationshipLabel: "Alterado" },
    });
    await owner.relationshipEntry.deleteMany({
      where: { organizationId: target.organization.id },
    });
    const hash = "synthetic-password-changed-after-snapshot";
    await owner.user.update({
      where: { id: target.user.id },
      data: { passwordHash: hash },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(await graphSnapshot(target.organization.id)).toEqual(expected);
    expect(await graphSnapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      (await owner.user.findUniqueOrThrow({ where: { id: target.user.id } }))
        .passwordHash
    ).toBe(hash);
    expect(
      (
        await owner.organizationMembership.findFirstOrThrow({
          where: {
            organizationId: target.organization.id,
            userId: target.user.id,
          },
        })
      ).isSuperuser
    ).toBe(true);
  });

  it("round-trips tags and both link types without touching another tenant", async () => {
    const target = await tagGraph();
    const other = await tagGraph();
    const expected = await graphSnapshot(target.organization.id);
    const foreignBefore = await graphSnapshot(other.organization.id);

    await owner.tag.update({
      where: { id: target.tag.id },
      data: { name: "Modificada" },
    });
    await owner.companyTag.deleteMany({
      where: { organizationId: target.organization.id },
    });
    await owner.contactTag.deleteMany({
      where: { organizationId: target.organization.id },
    });
    await owner.tag.create({
      data: {
        organizationId: target.organization.id,
        name: "Nova depois da cópia",
        normalizedName: "nova-depois",
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(await graphSnapshot(target.organization.id)).toEqual(expected);
    expect(await graphSnapshot(other.organization.id)).toEqual(foreignBefore);
    const membership = await owner.organizationMembership.findFirstOrThrow({
      where: {
        organizationId: target.organization.id,
        userId: target.user.id,
      },
    });
    expect(membership.isSuperuser).toBe(true);
  });

  it("rejects a broken tag reference before altering any tenant rows", async () => {
    const target = await tagGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.CompanyTag![0]!.tagId = randomUUID();

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("BACKUP_REFERENCES_INVALID");
    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("rolls back a late duplicate tag link without losing previous data", async () => {
    const target = await tagGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Tag![0]!.name = "Alterado sem commit";
    broken.ContactTag!.push({
      ...broken.ContactTag![0]!,
      id: randomUUID(),
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow(/23505|Unique constraint|duplicate key/);
    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("removes newer tags absent from the same-tenant backup", async () => {
    const target = await contactGraph();
    const label = await owner.tag.create({
      data: {
        organizationId: target.organization.id,
        name: "Só no estado atual",
        normalizedName: "so-atual",
      },
    });
    await owner.companyTag.create({
      data: {
        organizationId: target.organization.id,
        companyId: target.company.id,
        tagId: label.id,
      },
    });
    await owner.contactTag.create({
      data: {
        organizationId: target.organization.id,
        contactId: target.contact.id,
        tagId: label.id,
      },
    });
    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );
    const after = await graphSnapshot(target.organization.id);
    expect(after.Tag).toEqual([]);
    expect(after.CompanyTag).toEqual([]);
    expect(after.ContactTag).toEqual([]);
  });

  it("restores pipeline stages without affecting other tenants", async () => {
    const target = await pipelineGraph();
    const other = await pipelineGraph();
    const expected = await graphSnapshot(target.organization.id);
    const otherBefore = await graphSnapshot(other.organization.id);

    await owner.pipeline.update({
      where: { id: target.pipeline.id },
      data: { name: "Funil modificado" },
    });
    await owner.pipelineStage.update({
      where: { id: target.first.id },
      data: { name: "Etapa modificada" },
    });
    await owner.pipelineStage.delete({ where: { id: target.second.id } });
    await owner.pipelineStage.create({
      data: {
        organizationId: target.organization.id,
        pipelineId: target.pipeline.id,
        name: "Criada após backup",
        position: 3,
        kind: "LOST",
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(await graphSnapshot(target.organization.id)).toEqual(expected);
    expect(await graphSnapshot(other.organization.id)).toEqual(otherBefore);
  });

  it("rejects stages with invalid pipeline references", async () => {
    const target = await pipelineGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.PipelineStage![0]!.pipelineId = randomUUID();

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("BACKUP_REFERENCES_INVALID");

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("rolls back a duplicate pipeline stage", async () => {
    const target = await pipelineGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Pipeline![0]!.name = "Não persistir";
    broken.PipelineStage!.push({
      ...broken.PipelineStage![0]!,
      id: randomUUID(),
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow(/23505|Unique constraint|duplicate key/);

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("removes pipeline stages created after the backup", async () => {
    const target = await fixture();
    const pipeline = await owner.pipeline.create({
      data: {
        organizationId: target.organization.id,
        name: "Novo funil",
        normalizedName: "novo-funil",
      },
    });
    await owner.pipelineStage.create({
      data: {
        organizationId: target.organization.id,
        pipelineId: pipeline.id,
        name: "Nova etapa",
        position: 1,
        kind: "OPEN",
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    const restored = await graphSnapshot(target.organization.id);
    expect(restored.Pipeline).toEqual([]);
    expect(restored.PipelineStage).toEqual([]);
  });

  it("blocks restore when an unsupported live ticket exists", async () => {
    const target = await pipelineGraph();
    const before = await graphSnapshot(target.organization.id);
    const ticket = await owner.ticket.create({
      data: {
        organizationId: target.organization.id,
        protocol: "2026-000001",
        subject: "Created after backup",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
    expect(
      await owner.ticket.findUnique({ where: { id: ticket.id } })
    ).not.toBeNull();
  });

  it("preserves PostgreSQL microseconds in a company-only snapshot", async () => {
    const target = await fixture();
    const company = (await companies(target.organization.id))[0]!;
    await owner.$executeRawUnsafe(
      `UPDATE companies SET created_at='2026-10-01T12:00:00.123456Z',
        updated_at='2026-10-02T12:00:00.654321Z' WHERE id=$1::uuid`,
      company.id
    );
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);
    const before = await graphSnapshot(target.organization.id);

    await runtime.withMaintenance(
      target.organization.id,
      tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("rejects a broken note reference before replacing any graph rows", async () => {
    const target = await contactGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.RelationshipEntry![0]!.contactId = randomUUID();

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("BACKUP_REFERENCES_INVALID");

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("removes a live contact graph absent from the same-tenant snapshot", async () => {
    const target = await contactGraph();
    const other = await contactGraph();
    const otherBefore = await graphSnapshot(other.organization.id);
    const empty = structuredClone(target.verified.data);
    for (const model of [
      "Company",
      "Contact",
      "ContactChannel",
      "CompanyContact",
      "RelationshipEntry",
    ])
      empty[model] = [];

    await runtime.withMaintenance(
      target.organization.id,
      tx => restoreTenantSnapshot(tx, target.organization.id, empty),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(
      Object.values(await graphSnapshot(target.organization.id)).every(
        rows => rows?.length === 0
      )
    ).toBe(true);
    expect(await graphSnapshot(other.organization.id)).toEqual(otherBefore);
  });

  it("rolls back all graph deletions and inserts when a late channel constraint fails", async () => {
    const target = await contactGraph();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company![0]!.legalName = "Must roll back";
    broken.Contact![0]!.fullName = "Must roll back";
    broken.ContactChannel!.push({
      ...broken.ContactChannel!.find(row => row.isPrimary === true)!,
      id: randomUUID(),
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow(/23505|Unique constraint|duplicate key/);

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("rejects live unsupported models created after the snapshot before replacing data", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);
    await owner.role.create({
      data: {
        organizationId: target.organization.id,
        name: "After snapshot",
        code: "AFTER_SNAPSHOT",
      },
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");

    expect(await companies(target.organization.id)).toEqual(before);
    expect(
      await owner.role.count({
        where: { organizationId: target.organization.id },
      })
    ).toBe(1);
  });

  it("rejects a contact row from another tenant before replacing data", async () => {
    const target = await contactGraph();
    const other = await fixture();
    const before = await graphSnapshot(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Contact![0]!.organizationId = other.organization.id;

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_TARGET_INVALID");

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("rechecks live user identities under the maintenance lock", async () => {
    const target = await contactGraph();
    const before = await graphSnapshot(target.organization.id);
    const email = `changed-${randomUUID()}@example.test`;
    await owner.user.update({
      where: { id: target.user.id },
      data: { email, emailNormalized: email },
    });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_USER_IDENTITY_CHANGED");

    expect(await graphSnapshot(target.organization.id)).toEqual(before);
  });

  it("restores tenant business data while preserving live user credentials", async () => {
    const organization = await owner.organization.create({
      data: { name: "Restore Executor", slug: randomUUID() },
    });
    const user = await owner.user.create({
      data: {
        email: `restore-${randomUUID()}@example.test`,
        emailNormalized: `restore-${randomUUID()}@example.test`,
        displayName: "Restore Operator",
        passwordHash: await passwords.hash("synthetic-original-password"),
      },
    });
    await owner.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        isSuperuser: true,
      },
    });

    const company = await owner.company.create({
      data: {
        organizationId: organization.id,
        legalName: "Company from backup",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    const backup = await backups.create(organization.id, user.id, "MANUAL");
    const verified = await backups.verify(organization.id, backup.id);

    const changedHash = await passwords.hash("synthetic-live-password");
    await owner.company.update({
      where: { id: company.id },
      data: { legalName: "Changed after backup" },
    });
    await owner.user.update({
      where: { id: user.id },
      data: { passwordHash: changedHash },
    });

    await runtime.withMaintenance(
      organization.id,
      tx => restoreTenantSnapshot(tx, organization.id, verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    const restored = await runtime.withTenant(organization.id, async tx => ({
      company: await tx.company.findUniqueOrThrow({
        where: { id: company.id },
      }),
      user: await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      }),
    }));

    expect(restored.company.legalName).toBe("Company from backup");
    expect(restored.user.passwordHash).toBe(changedHash);
  });

  it("rejects another tenant's empty backup without deleting the current tenant", async () => {
    const target = await fixture();
    const source = await fixture(true);
    const before = await companies(target.organization.id);

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            source.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_TARGET_INVALID");

    expect(await companies(target.organization.id)).toEqual(before);
    expect(await companies(source.organization.id)).toEqual([]);
  });

  it("restores an empty same-tenant backup and leaves the other tenant unchanged", async () => {
    const target = await fixture(true);
    const other = await fixture();
    const otherBefore = await companies(other.organization.id);
    await owner.company.create({
      data: {
        organizationId: target.organization.id,
        legalName: "Created after the empty snapshot",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });

    await runtime.withMaintenance(
      target.organization.id,
      tx =>
        restoreTenantSnapshot(tx, target.organization.id, target.verified.data),
      { isolationLevel: "RepeatableRead", timeout: 60_000 }
    );

    expect(await companies(target.organization.id)).toEqual([]);
    expect(await companies(other.organization.id)).toEqual(otherBefore);
  });

  it("rolls back deletion when replacement violates a database constraint", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company!.push({ ...broken.Company![0]! });

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, broken),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow();

    expect(await companies(target.organization.id)).toEqual(before);
  });

  it("fails closed for a non-empty unsupported Ticket replacement policy", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);
    await owner.ticket.create({
      data: {
        organizationId: target.organization.id,
        protocol: "2026-000002",
        subject: "Unsupported restore category",
        createdBy: target.user.id,
        updatedBy: target.user.id,
      },
    });
    const backup = await backups.create(
      target.organization.id,
      target.user.id,
      "MANUAL"
    );
    const verified = await backups.verify(target.organization.id, backup.id);

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx => restoreTenantSnapshot(tx, target.organization.id, verified.data),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_POLICY_UNSUPPORTED");

    expect(await companies(target.organization.id)).toEqual(before);
    expect(
      await owner.ticket.count({
        where: { organizationId: target.organization.id },
      })
    ).toBe(1);
  });

  it("rejects a transaction without the exclusive maintenance context", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);

    await expect(
      runtime.withTenant(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "RepeatableRead", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");

    expect(await companies(target.organization.id)).toEqual(before);
  });

  it("rejects maintenance at ReadCommitted before modifying data", async () => {
    const target = await fixture();
    const before = await companies(target.organization.id);

    await expect(
      runtime.withMaintenance(
        target.organization.id,
        tx =>
          restoreTenantSnapshot(
            tx,
            target.organization.id,
            target.verified.data
          ),
        { isolationLevel: "ReadCommitted", timeout: 60_000 }
      )
    ).rejects.toThrow("RESTORE_MAINTENANCE_REQUIRED");

    expect(await companies(target.organization.id)).toEqual(before);
  });
});
