import type { MembershipRole } from "@axes/contracts";
import type { Request } from "express";

import type { Permission } from "./permissions";

export type AuthMethod = "session" | "api_key";

export type AuthenticatedPrincipal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  sessionId: string;
  /** Permissões efetivas desta requisição — sempre o que autoriza, nunca o role sozinho. */
  permissions: readonly Permission[];
  authMethod: AuthMethod;
  /** Presente apenas quando authMethod === "api_key". */
  apiKeyId?: string;
  /** Protected membership attribute, never inferred from role permissions. */
  isSuperuser?: boolean;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedPrincipal;
  requestId?: string;
};
