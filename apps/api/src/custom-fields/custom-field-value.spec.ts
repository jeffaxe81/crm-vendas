import { validateCustomFieldValue } from "./custom-field-value";

describe("Cycle 2 custom field value validation", () => {
  it("rejects a non-number value for NUMBER definitions", () => {
    expect(() =>
      validateCustomFieldValue({ type: "NUMBER", options: null }, "abc")
    ).toThrow("Valor deve ser numérico.");
  });

  it("accepts a boolean value for BOOLEAN definitions", () => {
    expect(
      validateCustomFieldValue({ type: "BOOLEAN", options: null }, true)
    ).toBe(true);
  });

  it("rejects a SELECT value outside the configured options", () => {
    expect(() =>
      validateCustomFieldValue({ type: "SELECT", options: ["A"] }, "B")
    ).toThrow("Valor não pertence às opções permitidas.");
  });

  it("accepts a valid ISO calendar date and rejects an impossible date", () => {
    expect(
      validateCustomFieldValue({ type: "DATE", options: null }, "2026-09-07")
    ).toBe("2026-09-07");

    expect(() =>
      validateCustomFieldValue({ type: "DATE", options: null }, "2026-02-31")
    ).toThrow("Valor deve ser uma data ISO válida.");
  });

  it("accepts strings for TEXT definitions and rejects non-strings", () => {
    expect(
      validateCustomFieldValue({ type: "TEXT", options: null }, "Observação")
    ).toBe("Observação");

    expect(() =>
      validateCustomFieldValue({ type: "TEXT", options: null }, 123)
    ).toThrow("Valor deve ser textual.");
  });
});
