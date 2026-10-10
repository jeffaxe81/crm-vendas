import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import { BACKUP_SCHEMA } from "./backup-models";
import { join } from "node:path";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";

describe("backup inventory coverage", () => {
  it("keeps complete backup metadata synchronized with the source and generated client", async () => {
    const source = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8"
    );
    expect(BACKUP_SCHEMA.schemaSha256).toBe(
      createHash("sha256").update(source).digest("hex")
    );
    expect(BACKUP_SCHEMA.models.map(m => m.name).sort()).toEqual(
      Prisma.dmmf.datamodel.models.map(m => m.name).sort()
    );
    for (const model of BACKUP_SCHEMA.models) {
      const client = Prisma.dmmf.datamodel.models.find(
        m => m.name === model.name
      )!;
      expect(model.dbName).toBe(client.dbName);
      expect(model.primaryKey.length).toBeGreaterThan(0);
      expect(
        model.fields.map(f => ({ name: f.name, type: f.type, kind: f.kind }))
      ).toEqual(
        client.fields.map(f => ({ name: f.name, type: f.type, kind: f.kind }))
      );
    }
  });
  it("requires an explicit policy for every persistent Prisma model", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8"
    );
    const models = [...schema.matchAll(/^model (\w+) \{/gm)]
      .map(match => match[1])
      .sort();
    expect(TENANT_DATA_REGISTRY.map(entry => entry.model).sort()).toEqual(
      models
    );
    expect(new Set(TENANT_DATA_REGISTRY.map(entry => entry.table)).size).toBe(
      models.length
    );
    for (const entry of TENANT_DATA_REGISTRY) {
      const block = schema.match(
        new RegExp(`model ${entry.model} \\{([\\s\\S]*?)\\n\\}`)
      )?.[1];
      expect(block).toContain(`@@map("${entry.table}")`);
    }
  });
  it("never exports authentication secrets, active sessions or the superuser flag", () => {
    const policy = (model: string) =>
      TENANT_DATA_REGISTRY.find(entry => entry.model === model)!;
    expect(policy("RefreshSession").export).toBe("EXCLUDE");
    expect(policy("RefreshSession").restore).toBe("PRESERVE_AND_REVOKE");
    expect(policy("OperationPreview").export).toBe("EXCLUDE");
    expect(policy("OperationPreview").restore).toBe("PRESERVE");
    expect(policy("AuditLog").restore).toBe("PRESERVE");
    expect(policy("User").fields).toEqual(["id", "email", "displayName"]);
    expect(policy("User").restore).toBe("REFERENCES");
    expect(policy("OrganizationMembership").fields).not.toContain(
      "isSuperuser"
    );
    expect(policy("IntegrationCredential").fields).not.toContain("keyHash");
    expect(policy("IntegrationCredential").restore).toBe("PRESERVE");
    expect(policy("TicketSatisfactionSurvey").fields).not.toContain(
      "tokenHash"
    );
    expect(policy("TicketSatisfactionSurvey").restore).toBe(
      "RENEW_EXPIRED_TOKEN"
    );
  });
  it("requires projection or exclusion for models with security-bearing columns", async () => {
    const schema = await readFile(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8"
    );
    for (const entry of TENANT_DATA_REGISTRY) {
      const block =
        schema.match(
          new RegExp(`model ${entry.model} \\{([\\s\\S]*?)\\n\\}`)
        )?.[1] ?? "";
      const protectedFields = [
        ...block.matchAll(
          /^\s+(\w*(?:[Tt]oken|[Pp]assword|[Ss]ecret|[Kk]eyHash|[Ss]uperuser)\w*)\s+/gm
        ),
      ].map(match => match[1]);
      if (protectedFields.length === 0) continue;
      expect(entry.export).not.toBe("FULL");
      for (const field of protectedFields)
        expect(entry.fields ?? []).not.toContain(field);
    }
  });
});

describe("webhook restore safety", () => {
  it.each(["WebhookSubscription", "WebhookDispatch", "WebhookDelivery"])(
    "preserves and excludes %s from backup",
    model => {
      expect(
        TENANT_DATA_REGISTRY.find(policy => policy.model === model)
      ).toMatchObject({ export: "EXCLUDE", restore: "PRESERVE" });
    }
  );
});
