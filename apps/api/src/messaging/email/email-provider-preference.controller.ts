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
  EMAIL_PROVIDER_CODES,
  EmailProviderPreferenceService,
  type EmailProviderPreferenceContext,
} from "./email-provider-preference.service";

const UpdateSchema = z
  .object({
    version: z.number().int().min(0),
    providerCode: z.enum(EMAIL_PROVIDER_CODES),
  })
  .strict();

@Controller("admin/email/provider-preference")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("integration.manage")
export class EmailProviderPreferenceController {
  constructor(
    @Inject(EmailProviderPreferenceService)
    private readonly preferences: EmailProviderPreferenceService
  ) {}

  @Get()
  read(@Req() request: AuthenticatedRequest) {
    return this.preferences.read(this.context(request));
  }

  @Put()
  update(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: "VALIDATION_ERROR" });
    }
    return this.preferences.update(parsed.data, this.context(request));
  }

  private context(
    request: AuthenticatedRequest
  ): EmailProviderPreferenceContext {
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
