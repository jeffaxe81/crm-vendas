import {
  TicketAssignToMeInputSchema,
  TicketCommentInputSchema,
  TicketCreateInputSchema,
  TicketListQuerySchema,
  TicketStatusChangeInputSchema,
  TicketUpdateInputSchema,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
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
import { TicketsService } from "./tickets.service";

const IdSchema = z.string().uuid();

type TicketRequest = AuthenticatedRequest & RequestWithId;

@Controller("tickets")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class TicketsController {
  constructor(
    @Inject(TicketsService) private readonly tickets: TicketsService
  ) {}

  @Get()
  @RequirePermissions("ticket.read")
  list(@Query() query: Record<string, unknown>, @Req() request: TicketRequest) {
    return this.tickets.list(
      this.parse(TicketListQuerySchema, query),
      this.requirePrincipal(request).organizationId,
      this.requirePrincipal(request).userId
    );
  }

  @Get(":id")
  @RequirePermissions("ticket.read")
  read(@Param("id") id: string, @Req() request: TicketRequest) {
    return this.tickets.read(
      this.parseId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id/events")
  @RequirePermissions("ticket.read")
  events(@Param("id") id: string, @Req() request: TicketRequest) {
    return this.tickets.listEvents(
      this.parseId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("ticket.write")
  create(@Body() body: unknown, @Req() request: TicketRequest) {
    return this.tickets.create(
      this.parse(TicketCreateInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("ticket.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TicketRequest
  ) {
    return this.tickets.update(
      this.parseId(id),
      this.parse(TicketUpdateInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Post(":id/status")
  @RequirePermissions("ticket.write")
  changeStatus(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TicketRequest
  ) {
    return this.tickets.changeStatus(
      this.parseId(id),
      this.parse(TicketStatusChangeInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Post(":id/assign-to-me")
  @HttpCode(200)
  @RequirePermissions("ticket.write")
  assignToMe(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TicketRequest
  ) {
    return this.tickets.assignToMe(
      this.parseId(id),
      this.parse(TicketAssignToMeInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Post(":id/comments")
  @RequirePermissions("ticket.write")
  comment(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TicketRequest
  ) {
    return this.tickets.comment(
      this.parseId(id),
      this.parse(TicketCommentInputSchema, body),
      this.contextFrom(request)
    );
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
        message: "Identificador de solicitação inválido.",
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: TicketRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: TicketRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
