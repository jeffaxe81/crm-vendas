import { z } from "zod";

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(200).optional(),
});

export const CompanyCreateInputSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().min(1).max(200).optional(),
  document: z.string().trim().min(1).max(32).optional(),
  website: z.string().trim().url().max(500).optional(),
  notes: z.string().trim().max(10_000).optional(),
});

export const CompanyUpdateInputSchema = CompanyCreateInputSchema.partial().refine(
  value => Object.values(value).some(item => item !== undefined),
  { message: "Informe ao menos uma alteração." }
);

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type CompanyCreateInput = z.infer<typeof CompanyCreateInputSchema>;
export type CompanyUpdateInput = z.infer<typeof CompanyUpdateInputSchema>;
