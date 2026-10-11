import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../../authorization/authenticated-request";
import { PermissionsGuard } from "../../authorization/permissions.guard";
import { RequirePermissions } from "../../authorization/require-permissions.decorator";
import { EmailRelayReadinessService } from "./email-relay-readiness.service";
import type { EmailRelaySettingsContext } from "./email-relay-settings.service";

@Controller("admin/email/relay-readiness")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("integration.manage")
export class EmailRelayReadinessController {
  constructor(
    @Inject(EmailRelayReadinessService)
    private readonly readiness: EmailRelayReadinessService
  ) {}

  @Get()
  inspect(@Req() request: AuthenticatedRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    const context: EmailRelaySettingsContext = {
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
    return this.readiness.inspect(context);
  }
}
