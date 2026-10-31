import assert from "node:assert/strict";
import test from "node:test";

import {
  CompanyCreateInputSchema,
  ContactChannelInputSchema,
  ContactCreateInputSchema,
  CustomFieldDefinitionInputSchema,
  OpportunityCreateInputSchema,
  TagInputSchema,
} from "../packages/contracts/dist/index.js";

const CHANNEL_TYPES = ["EMAIL", "PHONE", "MOBILE", "WHATSAPP", "OTHER"];
const FIELD_TYPES = ["TEXT", "NUMBER", "BOOLEAN", "DATE", "SELECT"];

function uuid(seed) {
  return `11111111-1111-4111-8111-${String(seed).padStart(12, "0")}`;
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/company/valid/${index}`, () => {
    const result = CompanyCreateInputSchema.safeParse({
      legalName: `Empresa ${index} Ltda`,
      tradeName: `Empresa ${index}`,
      document: `DOC${String(index).padStart(6, "0")}`,
      website: `https://empresa-${index}.example.test`,
      notes: `Caso determinístico ${index}`,
    });
    assert.equal(result.success, true);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/company/invalid-empty-name/${index}`, () => {
    const result = CompanyCreateInputSchema.safeParse({
      legalName: index % 2 === 0 ? "" : "   ",
    });
    assert.equal(result.success, false);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/contact/valid/${index}`, () => {
    const result = ContactCreateInputSchema.safeParse({
      fullName: `Contato ${index}`,
      jobTitle: `Cargo ${index}`,
      notes: `Contato determinístico ${index}`,
    });
    assert.equal(result.success, true);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/contact/invalid-empty-name/${index}`, () => {
    const result = ContactCreateInputSchema.safeParse({
      fullName: index % 2 === 0 ? "" : "   ",
    });
    assert.equal(result.success, false);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/channel/valid/${index}`, () => {
    const result = ContactChannelInputSchema.safeParse({
      type: CHANNEL_TYPES[index % CHANNEL_TYPES.length],
      value: `canal-${index}@example.test`,
      label: `Canal ${index}`,
      isPrimary: index % 3 === 0,
    });
    assert.equal(result.success, true);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/channel/invalid-type/${index}`, () => {
    const result = ContactChannelInputSchema.safeParse({
      type: `INVALID_${index}`,
      value: `canal-${index}`,
      isPrimary: false,
    });
    assert.equal(result.success, false);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/tag/valid/${index}`, () => {
    const result = TagInputSchema.safeParse({
      name: `Tag ${index}`,
    });
    assert.equal(result.success, true);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/tag/invalid-length/${index}`, () => {
    const result = TagInputSchema.safeParse({
      name: `tag-${index}-${"x".repeat(81)}`,
    });
    assert.equal(result.success, false);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/custom-field/definition/${index}`, () => {
    const type = FIELD_TYPES[index % FIELD_TYPES.length];
    const payload = {
      scope: index % 2 === 0 ? "COMPANY" : "CONTACT",
      key: `field_${index}`,
      label: `Campo ${index}`,
      type,
      isRequired: index % 2 === 0,
      isActive: true,
      ...(type === "SELECT" ? { options: ["A", "B", `C${index}`] } : {}),
    };
    const result = CustomFieldDefinitionInputSchema.safeParse(payload);
    assert.equal(result.success, true);
  });
}

for (let index = 0; index < 1_000; index += 1) {
  test(`regression/opportunity/customer-invariant/${index}`, () => {
    const base = {
      pipelineId: uuid(index + 1),
      stageId: uuid(index + 2_000),
      ownerUserId: uuid(index + 4_000),
      title: `Oportunidade ${index}`,
      estimatedValue: `${index}.50`,
    };

    const shouldBeValid = index % 2 === 0;
    const payload = shouldBeValid
      ? { ...base, companyId: uuid(index + 6_000) }
      : {
          ...base,
          companyId: uuid(index + 6_000),
          contactId: uuid(index + 8_000),
        };

    const result = OpportunityCreateInputSchema.safeParse(payload);
    assert.equal(result.success, shouldBeValid);
  });
}
