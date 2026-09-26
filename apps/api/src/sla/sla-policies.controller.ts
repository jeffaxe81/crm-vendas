import {
  SlaPolicyUpsertInputSchema,
  TicketPrioritySchema,
  type TicketPriority,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { ZodType } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { SlaPoliciesService } from "./sla-policies.service";

type SlaRequest = AuthenticatedRequest & RequestWithId;

@Controller("sla-policies")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class SlaPoliciesController {
  constructor(
    @Inject(SlaPoliciesService) private readonly policies: SlaPoliciesService
  ) {}

  @Get()
  @RequirePermissions("ticket.read")
  list(@Req() request: SlaRequest) {
    return this.policies.list(this.requirePrincipal(request).organizationId);
  }

  /** Upsert por prioridade: 201 ao criar, 200 ao editar (com `version`). */
  @Put(":priority")
  @RequirePermissions("support.manage")
  async upsert(
    @Param("priority") priority: string,
    @Body() body: unknown,
    @Req() request: SlaRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.policies.upsert(
      this.parse<TicketPriority>(TicketPrioritySchema, priority),
      this.parse(SlaPolicyUpsertInputSchema, body),
      this.contextFrom(request)
    );
    response.status(result.created ? 201 : 200);
    return result.policy;
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

  private requirePrincipal(request: SlaRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: SlaRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
