import { z } from "zod";

export const RelationshipEntryKindSchema = z.enum([
  "NOTE",
  "CALL_NOTE",
  "EMAIL_NOTE",
  "MEETING_NOTE",
  "OTHER",
]);

export const RelationshipEntryCreateInputSchema = z
  .object({
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    kind: RelationshipEntryKindSchema,
    content: z.string().trim().min(1).max(20_000),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .refine(
    value => value.companyId !== undefined || value.contactId !== undefined,
    {
      message: "Informe uma empresa ou um contato.",
    }
  );

export type RelationshipEntryKind = z.infer<typeof RelationshipEntryKindSchema>;
export type RelationshipEntryCreateInput = z.infer<
  typeof RelationshipEntryCreateInputSchema
>;
