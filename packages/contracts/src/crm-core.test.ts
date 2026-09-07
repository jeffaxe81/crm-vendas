import { describe, expect, it } from "vitest";

import * as contracts from "./index";

type SchemaLike = {
  parse(value: unknown): unknown;
};

function requireSchema(name: string): SchemaLike {
  const schema = (contracts as Record<string, unknown>)[name];
  expect(schema, `${name} must be exported`).toBeDefined();
  return schema as SchemaLike;
}

describe("Cycle 2 CRM core contracts", () => {
  it("accepts a contact without company", () => {
    const schema = requireSchema("ContactCreateInputSchema");

    expect(schema.parse({ fullName: "  Ana Silva  " })).toMatchObject({
      fullName: "Ana Silva",
    });
  });

  it("caps pagination at 100 items", () => {
    const schema = requireSchema("PaginationQuerySchema");

    expect(() => schema.parse({ page: 1, limit: 101 })).toThrow();
    expect(schema.parse({ page: "2", limit: "50", q: "  Acme  " })).toMatchObject({
      page: 2,
      limit: 50,
      q: "Acme",
    });
  });

  it("accepts supported contact channel types", () => {
    const schema = requireSchema("ContactChannelInputSchema");

    expect(
      schema.parse({ type: "EMAIL", value: "ana@example.com", isPrimary: true })
    ).toMatchObject({
      type: "EMAIL",
      value: "ana@example.com",
      isPrimary: true,
    });
  });

  it("rejects a relationship entry without company or contact", () => {
    const schema = requireSchema("RelationshipEntryCreateInputSchema");

    expect(() =>
      schema.parse({
        kind: "NOTE",
        content: "Contato inicial",
        occurredAt: "2026-09-06T22:00:00.000Z",
      })
    ).toThrow();
  });

  it("normalizes tag input", () => {
    const schema = requireSchema("TagInputSchema");

    expect(schema.parse({ name: "  Cliente VIP  " })).toMatchObject({
      name: "Cliente VIP",
    });
  });

  it("rejects SELECT custom field definitions without options", () => {
    const schema = requireSchema("CustomFieldDefinitionInputSchema");

    expect(() =>
      schema.parse({
        scope: "COMPANY",
        key: "segment",
        label: "Segmento",
        type: "SELECT",
        options: [],
      })
    ).toThrow();

    expect(
      schema.parse({
        scope: "COMPANY",
        key: "segment",
        label: "Segmento",
        type: "SELECT",
        options: ["Enterprise", "SMB"],
      })
    ).toMatchObject({
      type: "SELECT",
      options: ["Enterprise", "SMB"],
    });
  });
});
