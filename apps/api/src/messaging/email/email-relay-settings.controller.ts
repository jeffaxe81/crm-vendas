import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthenticationGuard } from "../../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../../authorization/authenticated-request";
import { PermissionsGuard } from "../../authorization/permissions.guard";
import { RequirePermissions } from "../../authorization/require-permissions.decorator";
import {
  EmailRelaySettingsService,
  type EmailRelaySettingsContext,
} from "./email-relay-settings.service";

const UpdateSchema = z
  .object({
    version: z.number().int().min(0),
    mode: z.enum(["DISABLED", "PREPARED"]),
    endpoint: z.string().min(1).max(512).optional(),
    bearerToken: z.string().min(16).max(1024).optional(),
    clearCredential: z.boolean().optional(),
  })
  .strict();

@Controller("admin/email/relay-settings")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("integration.manage")
export class EmailRelaySettingsController {
  constructor(
    @Inject(EmailRelaySettingsService)
    private readonly settings: EmailRelaySettingsService
  ) {}

  @Get()
  read(@Req() request: AuthenticatedRequest) {
    return this.settings.read(this.context(request));
  }

  @Put()
  update(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: "VALIDATION_ERROR" });
    }
    return this.settings.update(parsed.data, this.context(request));
  }

  private context(request: AuthenticatedRequest): EmailRelaySettingsContext {
    if (!request.auth)
      throw new Error("Authenticated principal unavailable after guard.");
    return {
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
