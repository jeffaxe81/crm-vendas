import type { MembershipRole } from "@axes/contracts";
import type { Request } from "express";

export type AuthenticatedPrincipal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  sessionId: string;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedPrincipal;
};
