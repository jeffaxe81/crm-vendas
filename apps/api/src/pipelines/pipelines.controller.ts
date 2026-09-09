import {
  PipelineCreateInputSchema,
  PipelineUpdateInputSchema,
  type PipelineCreateInput,
  type PipelineUpdateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { PipelinesService } from "./pipelines.service";

const PipelineIdSchema = z.string().uuid();

type PipelineRequest = AuthenticatedRequest & RequestWithId;

@Controller("pipelines")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class PipelinesController {
  constructor(
    @Inject(PipelinesService) private readonly pipelines: PipelinesService
  ) {}

  @Get()
  @RequirePermissions("pipeline.read")
  list(@Req() request: PipelineRequest) {
    return this.pipelines.list(this.requirePrincipal(request).organizationId);
  }

  @Get(":id")
  @RequirePermissions("pipeline.read")
  read(@Param("id") id: string, @Req() request: PipelineRequest) {
    return this.pipelines.read(
      this.parsePipelineId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("pipeline.write")
  create(@Body() body: unknown, @Req() request: PipelineRequest) {
    return this.pipelines.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("pipeline.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: PipelineRequest
  ) {
    return this.pipelines.update(
      this.parsePipelineId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  private parsePipelineId(id: string): string {
    const parsed = PipelineIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de funil inválido.",
      });
    }
    return parsed.data;
  }

  private parseCreate(body: unknown): PipelineCreateInput {
    const parsed = PipelineCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): PipelineUpdateInput {
    const parsed = PipelineUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: PipelineRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: PipelineRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
