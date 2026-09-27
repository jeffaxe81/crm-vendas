import {
  TicketSatisfactionLinkInputSchema,
  TicketSatisfactionResponseInputSchema,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z, type ZodType } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { TicketSatisfactionService } from "./ticket-satisfaction.service";

const IdSchema = z.string().uuid();

type SatisfactionRequest = AuthenticatedRequest & RequestWithId;

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues.map(issue => issue.message),
    });
  }
  return parsed.data;
}

function parseId(id: string): string {
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Identificador de solicitação inválido.",
    });
  }
  return parsed.data;
}

/** C5.4 — pesquisa de satisfação vista pela equipe (autenticada). */
@Controller("tickets")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class TicketSatisfactionController {
  constructor(
    @Inject(TicketSatisfactionService)
    private readonly satisfaction: TicketSatisfactionService
  ) {}

  @Get(":id/satisfaction")
  @RequirePermissions("ticket.read")
  read(@Param("id") id: string, @Req() request: SatisfactionRequest) {
    return this.satisfaction.read(
      parseId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post(":id/satisfaction/link")
  @RequirePermissions("ticket.write")
  generateLink(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: SatisfactionRequest
  ) {
    const principal = this.requirePrincipal(request);
    return this.satisfaction.generateLink(
      parseId(id),
      parse(TicketSatisfactionLinkInputSchema, body ?? {}),
      {
        organizationId: principal.organizationId,
        actorUserId: principal.userId,
        requestId: request.requestId ?? "request-id-unavailable",
        ipAddress: request.ip,
      }
    );
  }

  private requirePrincipal(request: SatisfactionRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }
}

/**
 * C5.4 — endpoints PÚBLICOS (sem sessão) da avaliação do cliente. O token
 * do link é a única credencial; ver `TicketSatisfactionService.locate`.
 */
@Controller("public/satisfaction")
export class PublicSatisfactionController {
  constructor(
    @Inject(TicketSatisfactionService)
    private readonly satisfaction: TicketSatisfactionService
  ) {}

  @Get(":token")
  read(@Param("token") token: string) {
    return this.satisfaction.readPublic(token);
  }

  @Post(":token")
  respond(
    @Param("token") token: string,
    @Body() body: unknown,
    @Req() request: RequestWithId
  ) {
    return this.satisfaction.respondPublic(
      token,
      parse(TicketSatisfactionResponseInputSchema, body),
      {
        requestId: request.requestId ?? "request-id-unavailable",
        ipAddress: request.ip ?? null,
      }
    );
  }
}
