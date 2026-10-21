import { BACKUP_SCHEMA } from "./backup-models";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";

describe("ticket restore schema contracts", () => {
  function relationFields(modelName: string, relationName: string): string[] {
    const model = BACKUP_SCHEMA.models.find(item => item.name === modelName);
    const relation = model?.fields.find(
      field => field.name === relationName && field.kind === "object"
    );
    if (!relation || relation.kind !== "object") {
      throw new Error("BACKUP_SCHEMA_UNSUPPORTED");
    }
    return [...relation.relationFromFields];
  }

  it("keeps ticket references scoped to the organization", () => {
    expect(relationFields("Ticket", "company")).toEqual([
      "companyId",
      "organizationId",
    ]);
    expect(relationFields("Ticket", "contact")).toEqual([
      "contactId",
      "organizationId",
    ]);
    expect(relationFields("Ticket", "queue")).toEqual([
      "queueId",
      "organizationId",
    ]);
    expect(relationFields("Ticket", "assigneeMembership")).toEqual([
      "organizationId",
      "assigneeUserId",
    ]);
  });

  it("keeps ticket events and dependents bound to the same organization", () => {
    for (const model of [
      "TicketEvent",
      "TicketSatisfactionSurvey",
      "EmailOutbox",
    ]) {
      expect(relationFields(model, "ticket")).toEqual([
        "ticketId",
        "organizationId",
      ]);
    }
  });

  it("preserves special policies for protocol counters and surveys", () => {
    const policy = (name: string) =>
      TENANT_DATA_REGISTRY.find(item => item.model === name)?.restore;
    expect(policy("Ticket")).toBe("REPLACE");
    expect(policy("TicketEvent")).toBe("REPLACE");
    expect(policy("TicketProtocolCounter")).toBe("MERGE_HIGH_WATER");
    expect(policy("TicketSatisfactionSurvey")).toBe("RENEW_EXPIRED_TOKEN");
  });
});
