import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaService } from "../database/prisma.service";
import {
  CustomFieldScope,
  CustomFieldType,
  type Prisma,
} from "../generated/prisma/client";
import type { SnapshotData } from "./backup-manifest";
import { BackupStore } from "./backup-store";
import { BackupService } from "./backup.service";
import { restoreTenantSnapshot } from "./restore-executor";
import { exportTenantSnapshot } from "./tenant-snapshot";

describe("transactional custom field restore", () => {
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
  const models = [
    "CustomFieldDefinition",
    "CompanyCustomFieldValue",
    "ContactCustomFieldValue",
  ] as const;

  // These are JSON text, never JS numbers or parsed/reserialized fixture data.
  const integer = "900719925474099312345678901234567890";
  const fraction = "0.123456789012345678901234567890123456789";
  const nested = String.raw`{"nested":{"array":[null,true,false,{"quote":"\"'\\\n\t","unicode":"ç 漢字 🚀"}]},"integer":900719925474099312345678901234567890,"fraction":0.123456789012345678901234567890123456789}`;
  const escapedString = String.raw`"Aspas: \"' barra: \\ linha: \n tab: \t ç 漢字 🚀"`;
  const rawOptions: Record<CustomFieldType, string | null> = {
    TEXT: null,
    NUMBER: "null",
    BOOLEAN: nested,
    DATE: escapedString,
    SELECT: String.raw`["opção 'um'", "ç 漢字 🚀", {"nested":[true,null]}]`,
  };
  const rawValues: Record<CustomFieldScope, Record<CustomFieldType, string>> = {
    COMPANY: {
      TEXT: nested,
      NUMBER: integer,
      BOOLEAN: "true",
      DATE: escapedString,
      SELECT: String.raw`["opção 'um'", null, false, {"children":[1,"ç"]}]`,
    },
    CONTACT: {
      TEXT: escapedString,
      NUMBER: fraction,
      BOOLEAN: "false",
      DATE: "null",
      SELECT: String.raw`[{"array":[true,false,null,"漢字"]}, [], {}]`,
    },
  };

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
    root = await mkdtemp(join(tmpdir(), "axes-restore-custom-fields-"));
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
      data: { name: "Custom field restore safety", slug: randomUUID() },
    });
    const email = `custom-restore-${randomUUID()}@example.test`;
    const user = await owner.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: "Synthetic custom field restore operator",
        passwordHash: "synthetic-custom-original-password",
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
    const authors = { createdBy: target.user.id, updatedBy: target.user.id };
    const company = await owner.company.create({
      data: { organizationId, legalName: "Empresa sintética", ...authors },
    });
    const contact = await owner.contact.create({
      data: { organizationId, fullName: "Contato sintético", ...authors },
    });
    const prefix = randomUUID();
    const definitions = [];
    for (const scope of Object.values(CustomFieldScope)) {
      for (const [index, type] of Object.values(CustomFieldType).entries()) {
        const definition = await owner.customFieldDefinition.create({
          data: {
            organizationId,
            scope,
            // Same key in both scopes is a valid, intentional fixture.
            key: `${prefix}_${type}`,
            label: `Campo ${type}: 'aspas', ç e 漢字`,
            type,
            isRequired: index % 2 === 0,
            isActive: index % 2 !== 0,
            // SELECT is valid from creation; other options are set as raw JSON.
            ...(type === "SELECT" ? { options: ["temporary"] } : {}),
          },
        });
        definitions.push(definition);
        await owner.$executeRawUnsafe(
          `UPDATE custom_field_definitions SET options=$1::jsonb,
            created_at=$2::timestamptz, updated_at=$3::timestamptz
            WHERE id=$4::uuid`,
          rawOptions[type],
          createdAt,
          updatedAt,
          definition.id
        );
        const table =
          scope === "COMPANY"
            ? "company_custom_field_values"
            : "contact_custom_field_values";
        const foreignKey = scope === "COMPANY" ? "company_id" : "contact_id";
        await owner.$executeRawUnsafe(
          `INSERT INTO "${table}"
            (id, organization_id, "${foreignKey}", definition_id, value,
             created_at, updated_at)
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,
                    $6::timestamptz,$7::timestamptz)`,
          randomUUID(),
          organizationId,
          scope === "COMPANY" ? company.id : contact.id,
          definition.id,
          rawValues[scope][type],
          createdAt,
          updatedAt
        );
      }
    }
    return { company, contact, definitions };
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

  function nativeJson(organizationId: string) {
    return runtime.withTenant(
      organizationId,
      tx =>
        tx.$queryRawUnsafe<
          {
            model: string;
            id: string;
            jsonText: string | null;
            sqlNull: boolean;
          }[]
        >(
          `SELECT 'CustomFieldDefinition' AS model, id::text AS id,
             options::text AS "jsonText", options IS NULL AS "sqlNull"
             FROM custom_field_definitions WHERE organization_id=$1::uuid
           UNION ALL
           SELECT 'CompanyCustomFieldValue', id::text, value::text, value IS NULL
             FROM company_custom_field_values WHERE organization_id=$1::uuid
           UNION ALL
           SELECT 'ContactCustomFieldValue', id::text, value::text, value IS NULL
             FROM contact_custom_field_values WHERE organization_id=$1::uuid
           ORDER BY model, id`,
          organizationId
        ),
      transactionOptions
    );
  }

  async function changeLiveGraph(target: Awaited<ReturnType<typeof fixture>>) {
    await owner.company.update({
      where: { id: target.company.id },
      data: { legalName: "Empresa atual a preservar" },
    });
    await owner.contact.update({
      where: { id: target.contact.id },
      data: { fullName: "Contato atual a preservar" },
    });
    await owner.customFieldDefinition.updateMany({
      where: { organizationId: target.organization.id },
      data: { label: "Definição atual a preservar", isActive: true },
    });
    for (const table of [
      "company_custom_field_values",
      "contact_custom_field_values",
    ]) {
      await owner.$executeRawUnsafe(
        `UPDATE "${table}" SET value='{"live":true}'::jsonb
          WHERE organization_id=$1::uuid`,
        target.organization.id
      );
    }
    await createGraph(target);
  }

  it("round-trips all scopes/types, flags, raw JSONB forms and PostgreSQL microseconds", async () => {
    const target = await fixture();
    const other = await fixture();
    const organizationId = target.organization.id;
    const otherBefore = await snapshot(other.organization.id);
    const expected = target.verified.data;
    const nativeBefore = await nativeJson(organizationId);
    expect(expected.CustomFieldDefinition).toHaveLength(10);
    for (const definition of target.definitions) {
      const row = expected.CustomFieldDefinition!.find(
        item => item.id === definition.id
      )!;
      expect(row).toMatchObject({
        scope: definition.scope,
        type: definition.type,
        key: definition.key,
        label: definition.label,
        isRequired: definition.isRequired,
        isActive: definition.isActive,
        createdAt,
        updatedAt,
      });
      const native = nativeBefore.find(item => item.id === definition.id)!;
      expect(row.options).toBe(native.jsonText);
      if (definition.type === "TEXT") {
        expect(native).toMatchObject({ jsonText: null, sqlNull: true });
      } else if (definition.type === "NUMBER") {
        expect(native).toMatchObject({ jsonText: "null", sqlNull: false });
      } else {
        expect(typeof row.options).toBe("string");
        expect(native.sqlNull).toBe(false);
      }
      const model =
        definition.scope === "COMPANY"
          ? "CompanyCustomFieldValue"
          : "ContactCustomFieldValue";
      const value = expected[model]!.find(
        item => item.definitionId === definition.id
      )!;
      expect(value).toMatchObject({ createdAt, updatedAt });
      expect(value.value).toBe(
        nativeBefore.find(item => item.id === value.id)!.jsonText
      );
      expect(typeof value.value).toBe("string");
      if (definition.type === "NUMBER") {
        expect(value.value).toBe(
          definition.scope === "COMPANY" ? integer : fraction
        );
      }
      if (definition.scope === "CONTACT" && definition.type === "DATE") {
        expect(value.value).toBe("null");
        expect(nativeBefore.find(item => item.id === value.id)!.sqlNull).toBe(
          false
        );
      }
    }
    const nestedValue = expected.CompanyCustomFieldValue!.find(
      row =>
        row.definitionId ===
        target.definitions.find(
          definition =>
            definition.scope === "COMPANY" && definition.type === "TEXT"
        )!.id
    )!.value as string;
    expect(nestedValue).toContain(integer);
    expect(nestedValue).toContain(fraction);
    expect(nestedValue).toContain("ç 漢字 🚀");

    await changeLiveGraph(target);
    const passwordHash = "synthetic-custom-password-changed-after-backup";
    await owner.user.update({
      where: { id: target.user.id },
      data: { passwordHash },
    });
    // Only the excluded privilege bit changes; snapshot timestamps stay stable.
    await owner.$executeRawUnsafe(
      "UPDATE organization_memberships SET is_superuser=false WHERE id=$1::uuid",
      target.membership.id
    );

    await restore(organizationId, expected);

    expect(await snapshot(organizationId)).toEqual(expected);
    expect(await nativeJson(organizationId)).toEqual(nativeBefore);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    expect(
      (await owner.user.findUniqueOrThrow({ where: { id: target.user.id } }))
        .passwordHash
    ).toBe(passwordHash);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: target.membership.id },
        })
      ).isSuperuser
    ).toBe(false);
  });

  it("restores an authentic empty backup after a newer custom field graph was added", async () => {
    const target = await identity();
    const verified = await verifiedBackup(target);
    for (const model of models) expect(verified.data[model]).toEqual([]);
    await createGraph(target);
    const other = await fixture();
    const otherBefore = await snapshot(other.organization.id);

    await restore(target.organization.id, verified.data);

    expect(await snapshot(target.organization.id)).toEqual(verified.data);
    expect(await nativeJson(target.organization.id)).toEqual([]);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  });

  async function expectRejectedBeforeDeletion(
    target: Awaited<ReturnType<typeof fixture>>,
    broken: SnapshotData
  ) {
    await changeLiveGraph(target);
    const organizationId = target.organization.id;
    const before = await snapshot(organizationId);
    expect(before).not.toEqual(target.verified.data);
    const rollback = new Error(
      "Roll back after inspecting the rejected restore"
    );
    await expect(
      runtime.withMaintenance(
        organizationId,
        async tx => {
          await expect(
            restoreTenantSnapshot(tx, organizationId, broken)
          ).rejects.toMatchObject({ code: "BACKUP_REFERENCES_INVALID" });
          // Inspect within the SAME transaction: rollback must not hide a DELETE.
          expect(await snapshotInTransaction(tx, organizationId)).toEqual(
            before
          );
          throw rollback;
        },
        transactionOptions
      )
    ).rejects.toBe(rollback);
    expect(await snapshot(organizationId)).toEqual(before);
  }

  const references = [
    ["CompanyCustomFieldValue", "companyId", "Company"],
    ["CompanyCustomFieldValue", "definitionId", "CustomFieldDefinition"],
    ["ContactCustomFieldValue", "contactId", "Contact"],
    ["ContactCustomFieldValue", "definitionId", "CustomFieldDefinition"],
  ] as const;

  it.each(references)(
    "rejects a missing %s.%s before any deletion",
    async (model, field) => {
      const target = await fixture();
      const broken = structuredClone(target.verified.data);
      broken[model]![0]![field] = randomUUID();

      await expectRejectedBeforeDeletion(target, broken);
    }
  );

  it.each(references)(
    "rejects another tenant's existing ID in %s.%s before any deletion",
    async (model, field, referencedModel) => {
      const target = await fixture();
      const other = await fixture();
      const otherBefore = await snapshot(other.organization.id);
      const broken = structuredClone(target.verified.data);
      const scope = model === "CompanyCustomFieldValue" ? "COMPANY" : "CONTACT";
      const reference = other.verified.data[referencedModel]!.find(
        row =>
          referencedModel !== "CustomFieldDefinition" || row.scope === scope
      )!;
      broken[model]![0]![field] = reference.id;

      await expectRejectedBeforeDeletion(target, broken);
      expect(await snapshot(other.organization.id)).toEqual(otherBefore);
    }
  );

  async function expectConstraintRollback(
    mutate: (data: SnapshotData) => void,
    constraint: string
  ) {
    const target = await fixture();
    const other = await fixture();
    await changeLiveGraph(target);
    const before = await snapshot(target.organization.id);
    const otherBefore = await snapshot(other.organization.id);
    const broken = structuredClone(target.verified.data);
    broken.Company![0]!.legalName = "Não persistir empresa";
    broken.Contact![0]!.fullName = "Não persistir contato";
    for (const definition of broken.CustomFieldDefinition!) {
      definition.label = "Não persistir definição";
    }
    mutate(broken);

    await expect(restore(target.organization.id, broken)).rejects.toThrow(
      constraint
    );

    expect(await snapshot(target.organization.id)).toEqual(before);
    expect(await snapshot(other.organization.id)).toEqual(otherBefore);
  }

  it.each([
    ["CustomFieldDefinition", "custom_field_definitions_org_scope_key_key"],
    [
      "CompanyCustomFieldValue",
      "company_custom_field_values_org_company_definition_key",
    ],
    [
      "ContactCustomFieldValue",
      "contact_custom_field_values_org_contact_definition_key",
    ],
  ] as const)(
    "rolls back the business and custom graph after %s uniqueness fails",
    async (model, constraint) => {
      await expectConstraintRollback(data => {
        data[model]!.push({ ...data[model]![0]!, id: randomUUID() });
      }, constraint);
    }
  );

  it("rolls back prior business changes when SELECT options violate the named check", async () => {
    await expectConstraintRollback(data => {
      data.CustomFieldDefinition!.find(row => row.type === "SELECT")!.options =
        "[]";
    }, "custom_field_definitions_select_options_check");
  });
});
