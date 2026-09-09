import {
  OpportunityCreateInputSchema,
  type OpportunityCreateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { OpportunitiesService } from "./opportunities.service";

type OpportunityRequest = AuthenticatedRequest & RequestWithId;

@Controller("opportunities")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class OpportunitiesController {
  constructor(
    @Inject(OpportunitiesService)
    private readonly opportunities: OpportunitiesService
  ) {}

  @Post()
  @RequirePermissions("opportunity.write")
  create(@Body() body: unknown, @Req() request: OpportunityRequest) {
    return this.opportunities.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  private parseCreate(body: unknown): OpportunityCreateInput {
    const parsed = OpportunityCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: OpportunityRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: OpportunityRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
