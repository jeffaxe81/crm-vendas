import {
  ActivityCreateInputSchema,
  ActivityListQuerySchema,
  ActivityUpdateInputSchema,
  type ActivityCreateInput,
  type ActivityListQuery,
  type ActivityUpdateInput,
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
import { ActivitiesService } from "./activities.service";

const ActivityIdSchema = z.string().uuid();

type ActivityRequest = AuthenticatedRequest & RequestWithId;

@Controller("activities")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService
  ) {}

  @Get()
  @RequirePermissions("activity.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: ActivityRequest
  ) {
    return this.activities.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("activity.read")
  read(@Param("id") id: string, @Req() request: ActivityRequest) {
    return this.activities.read(
      this.parseActivityId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("activity.write")
  create(@Body() body: unknown, @Req() request: ActivityRequest) {
    return this.activities.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("activity.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: ActivityRequest
  ) {
    return this.activities.update(
      this.parseActivityId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("activity.write")
  async remove(
    @Param("id") id: string,
    @Req() request: ActivityRequest
  ): Promise<void> {
    await this.activities.remove(
      this.parseActivityId(id),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): ActivityListQuery {
    const parsed = ActivityListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseActivityId(id: string): string {
    const parsed = ActivityIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de atividade inválido.",
      });
    }
    return parsed.data;
  }

  private parseCreate(body: unknown): ActivityCreateInput {
    const parsed = ActivityCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): ActivityUpdateInput {
    const parsed = ActivityUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: ActivityRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: ActivityRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
