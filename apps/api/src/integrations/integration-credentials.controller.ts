import {
  IntegrationCredentialCreateInputSchema,
  type IntegrationCredentialCreateInput,
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
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { IntegrationCredentialsService } from "./integration-credentials.service";

const IdSchema = z.string().uuid();

@Controller("integrations/credentials")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class IntegrationCredentialsController {
  constructor(
    @Inject(IntegrationCredentialsService)
    private readonly credentials: IntegrationCredentialsService
  ) {}

  @Get()
  @RequirePermissions("integration.read")
  list(@Req() request: AuthenticatedRequest) {
    return this.credentials.list(this.requirePrincipal(request).organizationId);
  }

  @Post()
  @RequirePermissions("integration.manage")
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.credentials.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("integration.manage")
  async revoke(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    const parsed = IdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador inválido.",
      });
    }
    await this.credentials.revoke(parsed.data, this.contextFrom(request));
  }

  private parseCreate(body: unknown): IntegrationCredentialCreateInput {
    const parsed = IntegrationCredentialCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: AuthenticatedRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: AuthenticatedRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      actorRole: principal.role,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
