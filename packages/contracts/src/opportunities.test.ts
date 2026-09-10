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

const pipelineId = "11111111-1111-4111-8111-111111111111";
const stageId = "22222222-2222-4222-8222-222222222222";
const companyId = "33333333-3333-4333-8333-333333333333";
const contactId = "44444444-4444-4444-8444-444444444444";
const ownerUserId = "55555555-5555-4555-8555-555555555555";

describe("Cycle 3.6.2 opportunity contracts", () => {
  it("accepts a company-backed opportunity with decimal value", () => {
    const schema = requireSchema("OpportunityCreateInputSchema");

    expect(
      schema.safeParse({
        pipelineId,
        stageId,
        companyId,
        ownerUserId,
        title: "Renovação anual",
        estimatedValue: "1250.50",
      }).success
    ).toBe(true);
  });

  it("requires exactly one commercial customer", () => {
    const schema = requireSchema("OpportunityCreateInputSchema");

    expect(
      schema.safeParse({
        pipelineId,
        stageId,
        companyId,
        contactId,
        ownerUserId,
        title: "Cliente duplicado",
        estimatedValue: "10.00",
      }).success
    ).toBe(false);

    expect(
      schema.safeParse({
        pipelineId,
        stageId,
        ownerUserId,
        title: "Sem cliente",
        estimatedValue: "10.00",
      }).success
    ).toBe(false);
  });

  it("preserves Decimal(19,2) limits in the public contract", () => {
    const schema = requireSchema("OpportunityCreateInputSchema");

    expect(
      schema.safeParse({
        pipelineId,
        stageId,
        companyId,
        ownerUserId,
        title: "Valor válido",
        estimatedValue: "99999999999999999.99",
      }).success
    ).toBe(true);

    for (const estimatedValue of [
      "-0.01",
      "0.001",
      "100000000000000000.00",
      "01.00",
    ]) {
      expect(
        schema.safeParse({
          pipelineId,
          stageId,
          companyId,
          ownerUserId,
          title: "Valor inválido",
          estimatedValue,
        }).success
      ).toBe(false);
    }
  });

  it("requires a real change in update and version in stage move", () => {
    const updateSchema = requireSchema("OpportunityUpdateInputSchema");
    const moveSchema = requireSchema("OpportunityMoveInputSchema");

    expect(updateSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(moveSchema.parse({ stageId, version: 2 })).toEqual({
      stageId,
      version: 2,
    });
  });
});
