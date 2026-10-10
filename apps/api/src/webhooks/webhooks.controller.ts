import {
  WebhookSubscriptionCreateInputSchema,
  WebhookSubscriptionUpdateInputSchema,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { WebhooksService } from "./webhooks.service";

@Controller("integrations/webhooks")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class WebhooksController {
  constructor(
    @Inject(WebhooksService) private readonly webhooks: WebhooksService
  ) {}
  @Get()
  @RequirePermissions("integration.read")
  list(@Req() request: AuthenticatedRequest) {
    return this.webhooks.list(this.context(request).organizationId);
  }
  @Post()
  @RequirePermissions("integration.manage")
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.webhooks.create(
      this.parse(WebhookSubscriptionCreateInputSchema, body),
      this.context(request)
    );
  }
  @Patch(":id")
  @RequirePermissions("integration.manage")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    return this.webhooks.update(
      this.parse(z.string().uuid(), id),
      this.parse(WebhookSubscriptionUpdateInputSchema, body),
      this.context(request)
    );
  }
  @Post(":id/test")
  @RequirePermissions("integration.manage")
  test(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    this.parse(z.object({}).strict(), body ?? {});
    return this.webhooks.test(
      this.parse(z.string().uuid(), id),
      this.context(request)
    );
  }
  @Get(":id/deliveries")
  @RequirePermissions("integration.read")
  history(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.webhooks.history(
      this.parse(z.string().uuid(), id),
      this.context(request).organizationId
    );
  }
  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    return parsed.data;
  }
  private context(request: AuthenticatedRequest) {
    if (!request.auth)
      throw Error("Authenticated principal unavailable after guard.");
    return {
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
