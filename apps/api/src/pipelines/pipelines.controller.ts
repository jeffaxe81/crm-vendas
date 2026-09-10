import {
  Controller,
  Get,
  HttpCode,
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
import { PipelinesService } from "./pipelines.service";

type PipelineRequest = AuthenticatedRequest & RequestWithId;

@Controller("pipelines")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class PipelinesController {
  constructor(
    @Inject(PipelinesService) private readonly pipelines: PipelinesService
  ) {}

  @Get()
  @RequirePermissions("opportunity.read")
  list(@Req() request: PipelineRequest) {
    return this.pipelines.list(this.requirePrincipal(request).organizationId);
  }

  @Post("default")
  @HttpCode(200)
  @RequirePermissions("pipeline.manage")
  ensureDefault(@Req() request: PipelineRequest) {
    const principal = this.requirePrincipal(request);
    return this.pipelines.ensureDefault({
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    });
  }

  private requirePrincipal(request: PipelineRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }
}
