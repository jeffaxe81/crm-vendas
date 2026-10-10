import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthenticationGuard } from "../../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../../authorization/authenticated-request";
import { PermissionsGuard } from "../../authorization/permissions.guard";
import { RequirePermissions } from "../../authorization/require-permissions.decorator";
import {
  EmailManualReviewService,
  type EmailReviewContext,
} from "./email-manual-review.service";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

const Resolution = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("CONFIRMED_ACCEPTED"),
    evidenceReference: z.string().regex(/^[A-Za-z0-9._:/#-]{8,180}$/),
    providerMessageId: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/),
  }).strict(),
  z.object({
    decision: z.literal("CONFIRMED_NOT_ACCEPTED"),
    evidenceReference: z.string().regex(/^[A-Za-z0-9._:/#-]{8,180}$/),
  }).strict(),
]);

@Controller("admin/email/manual-review")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("integration.manage")
export class EmailManualReviewController {
  constructor(
    @Inject(EmailManualReviewService)
    private readonly service: EmailManualReviewService
  ) {}

  @Get()
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    const parsed = ListQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR" });
    return this.service.list(this.context(request), parsed.data.limit);
  }

  @Post(":id/resolve")
  resolve(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    if (!z.string().uuid().safeParse(id).success) {
      throw new BadRequestException({ code: "VALIDATION_ERROR" });
    }
    const parsed = Resolution.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR" });
    return this.service.resolve(id, parsed.data, this.context(request));
  }

  private context(request: AuthenticatedRequest): EmailReviewContext {
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
