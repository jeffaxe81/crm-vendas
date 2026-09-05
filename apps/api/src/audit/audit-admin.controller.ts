import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { AuditService } from "./audit.service";

const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller("admin/audit")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("audit.read")
export class AuditAdminController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  read(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    const parsed = AuditQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }

    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }

    return this.audit.list(
      request.auth.organizationId,
      parsed.data.page,
      parsed.data.limit
    );
  }
}
