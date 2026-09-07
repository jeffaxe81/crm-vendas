import { z } from "zod";

export const ContactChannelTypeSchema = z.enum([
  "EMAIL",
  "PHONE",
  "MOBILE",
  "WHATSAPP",
  "OTHER",
]);

export const ContactChannelInputSchema = z.object({
  type: ContactChannelTypeSchema,
  value: z.string().trim().min(1).max(320),
  label: z.string().trim().min(1).max(80).optional(),
  isPrimary: z.boolean().default(false),
});

export const ContactCreateInputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().min(1).max(160).optional(),
  notes: z.string().trim().max(10_000).optional(),
});

export const ContactUpdateInputSchema =
  ContactCreateInputSchema.partial().refine(
    value => Object.values(value).some(item => item !== undefined),
    { message: "Informe ao menos uma alteração." }
  );

export type ContactChannelType = z.infer<typeof ContactChannelTypeSchema>;
export type ContactChannelInput = z.infer<typeof ContactChannelInputSchema>;
export type ContactCreateInput = z.infer<typeof ContactCreateInputSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateInputSchema>;
