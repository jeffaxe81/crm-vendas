import {
  SupportQueueCreateInputSchema,
  SupportQueueListQuerySchema,
  SupportQueueUpdateInputSchema,
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
import { z, type ZodType } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { SupportQueuesService } from "./support-queues.service";

const IdSchema = z.string().uuid();

type SupportQueueRequest = AuthenticatedRequest & RequestWithId;

/** C5.2 — `/api/v1/support-queues`. */
@Controller("support-queues")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class SupportQueuesController {
  constructor(
    @Inject(SupportQueuesService)
    private readonly queues: SupportQueuesService
  ) {}

  @Get()
  @RequirePermissions("ticket.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: SupportQueueRequest
  ) {
    return this.queues.list(
      this.parse(SupportQueueListQuerySchema, query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("ticket.read")
  read(@Param("id") id: string, @Req() request: SupportQueueRequest) {
    return this.queues.read(
      this.parseId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("support.manage")
  create(@Body() body: unknown, @Req() request: SupportQueueRequest) {
    return this.queues.create(
      this.parse(SupportQueueCreateInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("support.manage")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: SupportQueueRequest
  ) {
    return this.queues.update(
      this.parseId(id),
      this.parse(SupportQueueUpdateInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("support.manage")
  async remove(
    @Param("id") id: string,
    @Req() request: SupportQueueRequest
  ): Promise<void> {
    await this.queues.remove(this.parseId(id), this.contextFrom(request));
  }

  private parse<T>(schema: ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseId(id: string): string {
    const parsed = IdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de fila inválido.",
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: SupportQueueRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: SupportQueueRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
