import { describe, expect, it } from "vitest";

import * as contracts from "./index";

type SchemaLike = {
  parse(value: unknown): unknown;
  safeParse(value: unknown): { success: boolean };
};

function requireSchema(name: string): SchemaLike {
  const schema = (contracts as Record<string, unknown>)[name];
  expect(schema, `${name} must be exported`).toBeDefined();
  return schema as SchemaLike;
}

const companyId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";
const opportunityId = "33333333-3333-4333-8333-333333333333";

describe("Cycle 5 knowledge contracts", () => {
  it("accepts NOTE with normalized metadata and relationships", () => {
    const schema = requireSchema("KnowledgeCreateInputSchema");

    expect(
      schema.parse({
        type: "NOTE",
        title: "  Ata da reunião  ",
        category: "  Comercial  ",
        source: "  CRM  ",
        accessLevel: "ORGANIZATION",
        noteContent: "  Cliente pediu retorno na sexta.  ",
        companyIds: [companyId],
        contactIds: [contactId],
        opportunityIds: [opportunityId],
      })
    ).toMatchObject({
      type: "NOTE",
      title: "Ata da reunião",
      category: "Comercial",
      source: "CRM",
      accessLevel: "ORGANIZATION",
      noteContent: "Cliente pediu retorno na sexta.",
    });
  });

  it("accepts only http or https links", () => {
    const schema = requireSchema("KnowledgeCreateInputSchema");

    expect(
      schema.safeParse({
        type: "LINK",
        title: "Portal",
        accessLevel: "ORGANIZATION",
        url: "https://example.test/referencia",
      }).success
    ).toBe(true);

    expect(
      schema.safeParse({
        type: "LINK",
        title: "FTP",
        accessLevel: "ORGANIZATION",
        url: "ftp://example.test/file",
      }).success
    ).toBe(false);
  });

  it("accepts a base64 document payload and rejects malformed base64", () => {
    const schema = requireSchema("KnowledgeCreateInputSchema");

    expect(
      schema.safeParse({
        type: "DOCUMENT",
        title: "Contrato",
        accessLevel: "PRIVATE",
        document: {
          fileName: "contrato.pdf",
          mimeType: "application/pdf",
          base64: "SGVsbG8=",
        },
      }).success
    ).toBe(true);

    expect(
      schema.safeParse({
        type: "DOCUMENT",
        title: "Contrato inválido",
        accessLevel: "PRIVATE",
        document: {
          fileName: "contrato.pdf",
          mimeType: "application/pdf",
          base64: "***not-base64***",
        },
      }).success
    ).toBe(false);
  });

  it("limits each relationship class to 20 unique UUIDs", () => {
    const schema = requireSchema("KnowledgeCreateInputSchema");
    const repeated = Array.from({ length: 2 }, () => companyId);
    const tooMany = Array.from({ length: 21 }, (_, index) => {
      const suffix = (index + 1).toString(16).padStart(12, "0");
      return `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
    });

    expect(
      schema.safeParse({
        type: "NOTE",
        title: "Duplicado",
        accessLevel: "ORGANIZATION",
        noteContent: "Teste",
        companyIds: repeated,
      }).success
    ).toBe(false);

    expect(
      schema.safeParse({
        type: "NOTE",
        title: "Muitos vínculos",
        accessLevel: "ORGANIZATION",
        noteContent: "Teste",
        companyIds: tooMany,
      }).success
    ).toBe(false);
  });

  it("accepts list filters and rejects an excessive page size", () => {
    const schema = requireSchema("KnowledgeListQuerySchema");

    expect(
      schema.parse({
        page: "2",
        limit: "50",
        q: "  contrato  ",
        type: "DOCUMENT",
      })
    ).toMatchObject({
      page: 2,
      limit: 50,
      q: "contrato",
      type: "DOCUMENT",
    });

    expect(schema.safeParse({ page: 1, limit: 101 }).success).toBe(false);
  });

  it("registers the knowledge workspace behind knowledge.read", () => {
    const destinations = (contracts as Record<string, unknown>)[
      "workspaceDestinations"
    ] as Array<{ id: string; label: string; group: string | null; permission: string | null }>;

    expect(destinations).toContainEqual({
      id: "knowledge",
      label: "Hub de conhecimento",
      group: "Conhecimento",
      permission: "knowledge.read",
    });
  });

  it("exports access and AI status schemas without executing AI", () => {
    const access = requireSchema("KnowledgeAccessLevelSchema");
    const ai = requireSchema("KnowledgeAiStatusSchema");

    expect(access.safeParse("ORGANIZATION").success).toBe(true);
    expect(access.safeParse("PRIVATE").success).toBe(true);
    expect(ai.safeParse("UNPROCESSED").success).toBe(true);
    expect(ai.safeParse("READY").success).toBe(true);
    expect(ai.safeParse("FAILED").success).toBe(true);
  });
});
