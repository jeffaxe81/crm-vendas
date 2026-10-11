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
import { z } from "zod";
import { AuthenticationGuard } from "../../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../../authorization/authenticated-request";
import { PermissionsGuard } from "../../authorization/permissions.guard";
import { RequirePermissions } from "../../authorization/require-permissions.decorator";
import {
  EmailRelayEvidenceService,
  EMAIL_RELAY_EVIDENCE_TYPES,
} from "./email-relay-evidence.service";
import type { EmailRelaySettingsContext } from "./email-relay-settings.service";

const RecordSchema = z
  .object({
    type: z.enum(EMAIL_RELAY_EVIDENCE_TYPES),
    reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/),
  })
  .strict();

@Controller("admin/email/relay-evidence")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("integration.manage")
export class EmailRelayEvidenceController {
  constructor(
    @Inject(EmailRelayEvidenceService)
    private readonly evidence: EmailRelayEvidenceService
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.evidence.list(this.context(request));
  }

  @Post()
  record(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = RecordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: "EMAIL_EVIDENCE_INVALID_INPUT" });
    }
    return this.evidence.record(parsed.data, this.context(request));
  }

  @Post(":evidenceId/review")
  review(
    @Param("evidenceId") evidenceId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    const parsed = z
      .object({ decision: z.enum(["CHECKED", "REJECTED"]) })
      .strict()
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: "EMAIL_EVIDENCE_REVIEW_INVALID" });
    }
    return this.evidence.review(
      { evidenceId, decision: parsed.data.decision },
      this.context(request)
    );
  }

  private context(request: AuthenticatedRequest): EmailRelaySettingsContext {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return {
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
