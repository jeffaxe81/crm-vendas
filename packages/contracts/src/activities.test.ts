import { describe, expect, it } from "vitest";

import * as contracts from "./index";

type SchemaLike = {
  parse(value: unknown): Record<string, unknown>;
  safeParse(value: unknown): { success: boolean };
};

function requireSchema(name: string): SchemaLike {
  const schema = (contracts as Record<string, unknown>)[name];
  expect(schema, `${name} must be exported`).toBeDefined();
  return schema as SchemaLike;
}

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "22222222-2222-4222-8222-222222222222";

describe("C3.6.3 activity opportunity contracts", () => {
  it("retains an optional opportunityId when creating an activity", () => {
    const schema = requireSchema("ActivityCreateInputSchema");

    expect(
      schema.parse({
        type: "TASK",
        title: "Follow-up comercial",
        ownerUserId,
        opportunityId,
      })
    ).toMatchObject({ opportunityId });

    expect(
      schema.safeParse({
        type: "TASK",
        title: "Atividade sem oportunidade",
        ownerUserId,
      }).success
    ).toBe(true);
  });

  it("accepts link, unlink and omission in activity updates", () => {
    const schema = requireSchema("ActivityUpdateInputSchema");

    expect(schema.parse({ opportunityId })).toEqual({ opportunityId });
    expect(schema.parse({ opportunityId: null })).toEqual({
      opportunityId: null,
    });
    expect(schema.parse({ title: "Título atualizado" })).toEqual({
      title: "Título atualizado",
    });
  });

  it("retains opportunityId in activity list filters", () => {
    const schema = requireSchema("ActivityListQuerySchema");

    expect(schema.parse({ opportunityId })).toMatchObject({ opportunityId });
  });

  it("rejects invalid opportunityId values", () => {
    const createSchema = requireSchema("ActivityCreateInputSchema");
    const updateSchema = requireSchema("ActivityUpdateInputSchema");
    const listSchema = requireSchema("ActivityListQuerySchema");

    expect(
      createSchema.safeParse({
        type: "TASK",
        title: "Atividade inválida",
        ownerUserId,
        opportunityId: "not-a-uuid",
      }).success
    ).toBe(false);
    expect(
      updateSchema.safeParse({ opportunityId: "not-a-uuid" }).success
    ).toBe(false);
    expect(listSchema.safeParse({ opportunityId: "not-a-uuid" }).success).toBe(
      false
    );
  });
});
