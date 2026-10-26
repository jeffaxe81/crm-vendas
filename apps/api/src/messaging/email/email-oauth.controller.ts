import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthenticationGuard } from "../../authorization/authentication.guard";
import { PermissionsGuard } from "../../authorization/permissions.guard";
import { RequirePermissions } from "../../authorization/require-permissions.decorator";
import type { AuthenticatedRequest } from "../../authorization/authenticated-request";
import { EmailOAuthRuntimeService } from "./email-oauth-runtime.service";
const Provider = z.enum(["GMAIL", "MICROSOFT_365"]);
function validated<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({ code: "VALIDATION_ERROR" });
  return result.data;
}
@Controller("admin/email/oauth")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("integration.manage")
export class EmailOAuthController {
  constructor(
    @Inject(EmailOAuthRuntimeService)
    private readonly runtime: EmailOAuthRuntimeService
  ) {}
  @Get(":provider/status")
  @Header("Cache-Control", "no-store")
  status(
    @Param("provider") provider: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.runtime.status(
      validated(Provider, provider),
      this.context(request)
    );
  }
  @Post(":provider/connect")
  @Header("Cache-Control", "no-store")
  connect(
    @Param("provider") provider: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.runtime.connect(
      validated(Provider, provider),
      this.context(request)
    );
  }
  @Post("callback")
  @Header("Cache-Control", "no-store")
  callback(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = validated(
      z.object({ rawQuery: z.string().max(10000) }).strict(),
      body
    );
    return this.runtime.callback(input.rawQuery, this.context(request));
  }
  @Post(":provider/disconnect")
  @Header("Cache-Control", "no-store")
  disconnect(
    @Param("provider") provider: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    const input = validated(
      z.object({ version: z.number().int().min(1) }).strict(),
      body
    );
    return this.runtime.disconnect(
      validated(Provider, provider),
      input.version,
      this.context(request)
    );
  }
  private context(request: AuthenticatedRequest) {
    if (!request.auth) throw new Error("Authenticated principal unavailable");
    return {
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      sessionId: request.auth.sessionId,
      authMethod: request.auth.authMethod,
      requestId: request.requestId ?? "request-id-unavailable",
    };
  }
}
