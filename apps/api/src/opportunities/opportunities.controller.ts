import {
  OpportunityCreateInputSchema,
  OpportunityListQuerySchema,
  OpportunityMoveInputSchema,
  OpportunityUpdateInputSchema,
  type OpportunityCreateInput,
  type OpportunityListQuery,
  type OpportunityMoveInput,
  type OpportunityUpdateInput,
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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { OpportunitiesService } from "./opportunities.service";

const OpportunityIdSchema = z.string().uuid();

type OpportunityRequest = AuthenticatedRequest & RequestWithId;

@Controller("opportunities")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class OpportunitiesController {
  constructor(
    @Inject(OpportunitiesService)
    private readonly opportunities: OpportunitiesService
  ) {}

  @Get()
  @RequirePermissions("opportunity.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: OpportunityRequest
  ) {
    return this.opportunities.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("opportunity.read")
  read(@Param("id") id: string, @Req() request: OpportunityRequest) {
    return this.opportunities.read(
      this.parseOpportunityId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("opportunity.write")
  create(@Body() body: unknown, @Req() request: OpportunityRequest) {
    return this.opportunities.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id/stage")
  @RequirePermissions("opportunity.move")
  move(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: OpportunityRequest
  ) {
    return this.opportunities.move(
      this.parseOpportunityId(id),
      this.parseMove(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("opportunity.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: OpportunityRequest
  ) {
    return this.opportunities.update(
      this.parseOpportunityId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): OpportunityListQuery {
    const parsed = OpportunityListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseOpportunityId(id: string): string {
    const parsed = OpportunityIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de oportunidade inválido.",
      });
    }
    return parsed.data;
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

  private parseMove(body: unknown): OpportunityMoveInput {
    const parsed = OpportunityMoveInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): OpportunityUpdateInput {
    const parsed = OpportunityUpdateInputSchema.safeParse(body);
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
