import { z } from "zod";

import { MembershipRoleSchema } from "./auth";

export const CreateOrganizationUserInputSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(160),
  password: z.string().min(12).max(1024),
  role: MembershipRoleSchema,
});

export const UpdateOrganizationMembershipInputSchema = z
  .object({
    role: MembershipRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(value => value.role !== undefined || value.isActive !== undefined, {
    message: "Informe ao menos uma alteração.",
  });

export const OrganizationUserResponseSchema = z.object({
  membershipId: z.string().uuid(),
  role: MembershipRoleSchema,
  isActive: z.boolean(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1),
    isActive: z.boolean(),
  }),
});

export type CreateOrganizationUserInput = z.infer<
  typeof CreateOrganizationUserInputSchema
>;
export type UpdateOrganizationMembershipInput = z.infer<
  typeof UpdateOrganizationMembershipInputSchema
>;
export type OrganizationUserResponse = z.infer<
  typeof OrganizationUserResponseSchema
>;
