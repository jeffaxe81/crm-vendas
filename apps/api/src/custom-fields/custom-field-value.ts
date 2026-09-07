export type CustomFieldValueDefinition = {
  type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
  options?: unknown;
};

export function validateCustomFieldValue(
  _definition: CustomFieldValueDefinition,
  _value: unknown
): unknown {
  throw new Error("Validação de campo customizável não implementada.");
}
