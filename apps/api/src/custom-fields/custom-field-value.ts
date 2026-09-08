export type CustomFieldValueDefinition = {
  type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT";
  options?: unknown;
};

export function validateCustomFieldValue(
  definition: CustomFieldValueDefinition,
  value: unknown
): unknown {
  switch (definition.type) {
    case "TEXT":
      if (typeof value !== "string") {
        throw new Error("Valor deve ser textual.");
      }
      return value;

    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Valor deve ser numérico.");
      }
      return value;

    case "BOOLEAN":
      if (typeof value !== "boolean") {
        throw new Error("Valor deve ser booleano.");
      }
      return value;

    case "DATE": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("Valor deve ser uma data ISO válida.");
      }

      const date = new Date(`${value}T00:00:00.000Z`);
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        throw new Error("Valor deve ser uma data ISO válida.");
      }

      return value;
    }

    case "SELECT":
      if (
        typeof value !== "string" ||
        !Array.isArray(definition.options) ||
        !definition.options.includes(value)
      ) {
        throw new Error("Valor não pertence às opções permitidas.");
      }
      return value;
  }
}
