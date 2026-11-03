import { z } from "zod";

import { PaginationQuerySchema } from "./companies";

export const KnowledgeItemTypeSchema = z.enum(["NOTE", "LINK", "DOCUMENT"]);
export const KnowledgeAccessLevelSchema = z.enum(["ORGANIZATION", "PRIVATE"]);
export const KnowledgeAiStatusSchema = z.enum([
  "UNPROCESSED",
  "READY",
  "FAILED",
]);

const KnowledgeRelationIdsSchema = z
  .array(z.string().uuid())
  .max(20)
  .refine(values => new Set(values).size === values.length, {
    message: "Relacionamentos duplicados.",
  });

const KnowledgeBaseFields = {
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120).optional(),
  source: z.string().trim().min(1).max(200).optional(),
  accessLevel: KnowledgeAccessLevelSchema.default("ORGANIZATION"),
  companyIds: KnowledgeRelationIdsSchema.optional(),
  contactIds: KnowledgeRelationIdsSchema.optional(),
  opportunityIds: KnowledgeRelationIdsSchema.optional(),
} as const;

const HttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine(value => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Use uma URL HTTP ou HTTPS.");

const Base64Schema = z
  .string()
  .trim()
  .min(4)
  .refine(
    value =>
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        value
      ),
    "Documento em Base64 inválido."
  );

export const KnowledgeDocumentInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
    base64: Base64Schema,
  })
  .strict();

const KnowledgeNoteCreateInputSchema = z
  .object({
    ...KnowledgeBaseFields,
    type: z.literal("NOTE"),
    noteContent: z.string().trim().min(1).max(100_000),
  })
  .strict();

const KnowledgeLinkCreateInputSchema = z
  .object({
    ...KnowledgeBaseFields,
    type: z.literal("LINK"),
    url: HttpUrlSchema,
  })
  .strict();

const KnowledgeDocumentCreateInputSchema = z
  .object({
    ...KnowledgeBaseFields,
    type: z.literal("DOCUMENT"),
    document: KnowledgeDocumentInputSchema,
  })
  .strict();

export const KnowledgeCreateInputSchema = z.discriminatedUnion("type", [
  KnowledgeNoteCreateInputSchema,
  KnowledgeLinkCreateInputSchema,
  KnowledgeDocumentCreateInputSchema,
]);

export const KnowledgeUpdateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(120).nullable().optional(),
    source: z.string().trim().min(1).max(200).nullable().optional(),
    accessLevel: KnowledgeAccessLevelSchema.optional(),
    noteContent: z.string().trim().min(1).max(100_000).nullable().optional(),
    url: HttpUrlSchema.nullable().optional(),
    document: KnowledgeDocumentInputSchema.optional(),
    companyIds: KnowledgeRelationIdsSchema.optional(),
    contactIds: KnowledgeRelationIdsSchema.optional(),
    opportunityIds: KnowledgeRelationIdsSchema.optional(),
  })
  .strict()
  .refine(value => Object.values(value).some(item => item !== undefined), {
    message: "Informe ao menos uma alteração.",
  });

export const KnowledgeListQuerySchema = PaginationQuerySchema.extend({
  type: KnowledgeItemTypeSchema.optional(),
  accessLevel: KnowledgeAccessLevelSchema.optional(),
  createdBy: z.string().uuid().optional(),
});

export type KnowledgeItemType = z.infer<typeof KnowledgeItemTypeSchema>;
export type KnowledgeAccessLevel = z.infer<typeof KnowledgeAccessLevelSchema>;
export type KnowledgeAiStatus = z.infer<typeof KnowledgeAiStatusSchema>;
export type KnowledgeDocumentInput = z.infer<
  typeof KnowledgeDocumentInputSchema
>;
export type KnowledgeCreateInput = z.infer<typeof KnowledgeCreateInputSchema>;
export type KnowledgeUpdateInput = z.infer<typeof KnowledgeUpdateInputSchema>;
export type KnowledgeListQuery = z.infer<typeof KnowledgeListQuerySchema>;
