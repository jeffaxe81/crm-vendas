import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ManagementSummaryService } from "./management-summary.service";

@Controller("reports")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    @Inject(ManagementSummaryService)
    private readonly managementSummary: ManagementSummaryService
  ) {}

  @Get("management-summary")
  @RequirePermissions("reports.read")
  readManagementSummary(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    if (Object.keys(query).length > 0) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "O resumo gerencial não aceita parâmetros de consulta.",
      });
    }

    if (!request.auth) {
      throw new UnauthorizedException({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sessão autenticada obrigatória.",
      });
    }

    return this.managementSummary.read(request.auth.organizationId);
  }
}
