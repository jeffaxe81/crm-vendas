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

describe("Cycle 3 sales pipeline contracts", () => {
  it("accepts a valid opportunity creation payload", () => {
    const schema = requireSchema("OpportunityCreateInputSchema");

    expect(
      schema.parse({
        companyId: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        pipelineId: "33333333-3333-4333-8333-333333333333",
        stageId: "44444444-4444-4444-8444-444444444444",
        title: "Renovação anual",
        estimatedValue: 125000.5,
        currency: "BRL",
      })
    ).toMatchObject({
      title: "Renovação anual",
      estimatedValue: 125000.5,
      currency: "BRL",
    });
  });

  it("requires company, owner, pipeline, stage, title, value and currency", () => {
    const schema = requireSchema("OpportunityCreateInputSchema");
    expect(() => schema.parse({ title: "Incompleta" })).toThrow();
  });

  it("keeps contact optional", () => {
    const schema = requireSchema("OpportunityCreateInputSchema");
    const value = schema.parse({
      companyId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      pipelineId: "33333333-3333-4333-8333-333333333333",
      stageId: "44444444-4444-4444-8444-444444444444",
      title: "Sem contato específico",
      estimatedValue: 10,
      currency: "BRL",
    }) as Record<string, unknown>;
    expect(value.contactId).toBeUndefined();
  });

  it("accepts only OPEN, WON and LOST opportunity statuses", () => {
    const schema = requireSchema("OpportunityStatusSchema");
    expect(schema.parse("OPEN")).toBe("OPEN");
    expect(schema.parse("WON")).toBe("WON");
    expect(schema.parse("LOST")).toBe("LOST");
    expect(() => schema.parse("REOPENED")).toThrow();
  });

  it("validates pipeline stage movement payload", () => {
    const schema = requireSchema("OpportunityMoveInputSchema");
    expect(
      schema.parse({ stageId: "44444444-4444-4444-8444-444444444444" })
    ).toMatchObject({
      stageId: "44444444-4444-4444-8444-444444444444",
    });
    expect(() => schema.parse({ stageId: "not-a-uuid" })).toThrow();
  });

  it("allows closing only as WON or LOST", () => {
    const schema = requireSchema("OpportunityCloseInputSchema");
    expect(schema.parse({ status: "WON" })).toMatchObject({ status: "WON" });
    expect(
      schema.parse({ status: "LOST", lossReason: "Preço" })
    ).toMatchObject({ status: "LOST", lossReason: "Preço" });
    expect(() => schema.parse({ status: "OPEN" })).toThrow();
  });

  it("rejects a loss reason for a won opportunity", () => {
    const schema = requireSchema("OpportunityCloseInputSchema");
    expect(() =>
      schema.parse({ status: "WON", lossReason: "Não se aplica" })
    ).toThrow();
  });

  it("supports opportunity filters", () => {
    const schema = requireSchema("OpportunityListQuerySchema");
    expect(
      schema.parse({
        page: "1",
        limit: "20",
        companyId: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "22222222-2222-4222-8222-222222222222",
        stageId: "44444444-4444-4444-8444-444444444444",
        status: "OPEN",
      })
    ).toMatchObject({ page: 1, limit: 20, status: "OPEN" });
  });

  it("validates pipeline and stage inputs", () => {
    const pipelineSchema = requireSchema("PipelineCreateInputSchema");
    const stageSchema = requireSchema("PipelineStageCreateInputSchema");

    expect(pipelineSchema.parse({ name: "Vendas", isDefault: true })).toMatchObject({
      name: "Vendas",
      isDefault: true,
    });
    expect(stageSchema.parse({ name: "Proposta", position: 2 })).toMatchObject({
      name: "Proposta",
      position: 2,
    });
    expect(() => stageSchema.parse({ name: "", position: -1 })).toThrow();
  });
});
