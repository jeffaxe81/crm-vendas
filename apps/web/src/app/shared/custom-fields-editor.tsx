"use client";

import type { CustomFieldType } from "@axes/contracts";

export type CustomFieldDefinitionView = {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  scope: "COMPANY" | "CONTACT";
  isRequired: boolean;
  isActive: boolean;
  options: string[] | null;
};

type CustomFieldsEditorProps = {
  definitions: CustomFieldDefinitionView[];
  values: Record<string, unknown>;
  onChange: (definitionId: string, value: unknown) => void;
};

export function CustomFieldsEditor({
  definitions,
  values,
  onChange,
}: CustomFieldsEditorProps) {
  const activeDefinitions = definitions.filter(definition => definition.isActive);

  return (
    <div className="custom-fields-editor">
      {activeDefinitions.map(definition => {
        const value = values[definition.id];

        if (definition.type === "BOOLEAN") {
          return (
            <label key={definition.id} className="custom-fields-editor__boolean">
              <input
                type="checkbox"
                checked={value === true}
                onChange={event => onChange(definition.id, event.target.checked)}
              />
              <span>{definition.label}</span>
            </label>
          );
        }

        if (definition.type === "SELECT") {
          return (
            <label key={definition.id}>
              <span>{definition.label}</span>
              <select
                value={typeof value === "string" ? value : ""}
                required={definition.isRequired}
                onChange={event => onChange(definition.id, event.target.value)}
              >
                <option value="">Selecione</option>
                {(definition.options ?? []).map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        const inputType =
          definition.type === "NUMBER"
            ? "number"
            : definition.type === "DATE"
              ? "date"
              : "text";

        return (
          <label key={definition.id}>
            <span>{definition.label}</span>
            <input
              type={inputType}
              value={
                typeof value === "string" || typeof value === "number"
                  ? String(value)
                  : ""
              }
              required={definition.isRequired}
              onChange={event => {
                const nextValue =
                  definition.type === "NUMBER"
                    ? event.target.value === ""
                      ? ""
                      : Number(event.target.value)
                    : event.target.value;
                onChange(definition.id, nextValue);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}
