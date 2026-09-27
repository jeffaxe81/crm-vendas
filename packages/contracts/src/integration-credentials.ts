import { z } from "zod";

export const IntegrationCredentialCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  /** Validado contra a lista real de permissões no service da API. */
  scopes: z.array(z.string().trim().min(1).max(64)).min(1),
  expiresAt: z.string().datetime().optional(),
});

export const IntegrationCredentialSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  isActive: z.boolean(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export const IntegrationCredentialCreatedSchema =
  IntegrationCredentialSummarySchema.extend({
    /** Chave em texto puro — exibida uma única vez, nunca mais recuperável. */
    plainKey: z.string(),
  });

export type IntegrationCredentialCreateInput = z.infer<
  typeof IntegrationCredentialCreateInputSchema
>;
export type IntegrationCredentialSummary = z.infer<
  typeof IntegrationCredentialSummarySchema
>;
export type IntegrationCredentialCreated = z.infer<
  typeof IntegrationCredentialCreatedSchema
>;
