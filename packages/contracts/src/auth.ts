import { z } from "zod";

export const MembershipRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "SELLER",
  "VIEWER",
]);

export const LoginInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024),
  organizationSlug: z.string().trim().min(1).max(80).optional(),
});

export const AuthSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1),
  }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  membership: z.object({
    id: z.string().uuid(),
    role: MembershipRoleSchema,
  }),
  permissions: z.array(z.string()),
});

export type MembershipRole = z.infer<typeof MembershipRoleSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
