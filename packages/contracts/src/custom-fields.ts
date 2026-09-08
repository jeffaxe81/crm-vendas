import { z } from "zod";

export const CustomFieldScopeSchema = z.enum(["COMPANY", "CONTACT"]);
export const CustomFieldTypeSchema = z.enum([
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "SELECT",
]);

const CustomFieldOptionSchema = z.string().trim().min(1).max(120);

export const CustomFieldDefinitionInputSchema = z
  .object({
    scope: CustomFieldScopeSchema,
    key: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().trim().min(1).max(120),
    type: CustomFieldTypeSchema,
    isRequired: z.boolean().default(false),
    options: z.array(CustomFieldOptionSchema).max(50).optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (
      value.type === "SELECT" &&
      (!value.options || value.options.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Campos SELECT exigem ao menos uma opção.",
      });
    }
  });

export const CustomFieldValueInputSchema = z.object({
  value: z.unknown(),
});

export type CustomFieldScope = z.infer<typeof CustomFieldScopeSchema>;
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;
export type CustomFieldDefinitionInput = z.infer<
  typeof CustomFieldDefinitionInputSchema
>;
export type CustomFieldValueInput = z.infer<typeof CustomFieldValueInputSchema>;
