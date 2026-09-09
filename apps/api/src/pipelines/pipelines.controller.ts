import {
  PipelineCreateInputSchema,
  PipelineStageCreateInputSchema,
  PipelineStageReorderInputSchema,
  PipelineStageUpdateInputSchema,
  PipelineUpdateInputSchema,
  type PipelineCreateInput,
  type PipelineStageCreateInput,
  type PipelineStageReorderInput,
  type PipelineStageUpdateInput,
  type PipelineUpdateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
const PipelineStageIdSchema = z.string().uuid();

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

  @Post(":pipelineId/stages")
  @RequirePermissions("pipeline.write")
  createStage(
    @Param("pipelineId") pipelineId: string,
    @Body() body: unknown,
    @Req() request: PipelineRequest
  ) {
    return this.pipelines.createStage(
      this.parsePipelineId(pipelineId),
      this.parseStageCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":pipelineId/stages/reorder")
  @RequirePermissions("pipeline.write")
  reorderStages(
    @Param("pipelineId") pipelineId: string,
    @Body() body: unknown,
    @Req() request: PipelineRequest
  ) {
    return this.pipelines.reorderStages(
      this.parsePipelineId(pipelineId),
      this.parseStageReorder(body),
      this.contextFrom(request)
    );
  }

  @Patch(":pipelineId/stages/:stageId")
  @RequirePermissions("pipeline.write")
  updateStage(
    @Param("pipelineId") pipelineId: string,
    @Param("stageId") stageId: string,
    @Body() body: unknown,
    @Req() request: PipelineRequest
  ) {
    return this.pipelines.updateStage(
      this.parsePipelineId(pipelineId),
      this.parseStageId(stageId),
      this.parseStageUpdate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":pipelineId/stages/:stageId")
  @HttpCode(204)
  @RequirePermissions("pipeline.write")
  async deactivateStage(
    @Param("pipelineId") pipelineId: string,
    @Param("stageId") stageId: string,
    @Req() request: PipelineRequest
  ): Promise<void> {
    await this.pipelines.deactivateStage(
      this.parsePipelineId(pipelineId),
      this.parseStageId(stageId),
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

  private parseStageId(id: string): string {
    const parsed = PipelineStageIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de etapa inválido.",
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

  private parseStageCreate(body: unknown): PipelineStageCreateInput {
    const parsed = PipelineStageCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseStageUpdate(body: unknown): PipelineStageUpdateInput {
    const parsed = PipelineStageUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseStageReorder(body: unknown): PipelineStageReorderInput {
    const parsed = PipelineStageReorderInputSchema.safeParse(body);
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
