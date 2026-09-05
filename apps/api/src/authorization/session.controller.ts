import { Get, Controller, Req, UseGuards } from "@nestjs/common";

import { AuthenticationGuard } from "./authentication.guard";
import type { AuthenticatedRequest } from "./authenticated-request";
import { permissionsForRole } from "./permissions";

@Controller("auth")
export class SessionController {
  @Get("me")
  @UseGuards(AuthenticationGuard)
  read(@Req() request: AuthenticatedRequest) {
    const principal = request.auth;
    if (!principal) {
      return null;
    }

    return {
      userId: principal.userId,
      organizationId: principal.organizationId,
      membershipId: principal.membershipId,
      role: principal.role,
      permissions: [...permissionsForRole(principal.role)],
    };
  }
}
