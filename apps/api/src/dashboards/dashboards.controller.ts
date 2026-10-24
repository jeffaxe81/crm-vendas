import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
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
import { assertValidTenantContext } from "../database/prisma.service";
import { dashboardCatalog } from "./dashboard-catalog";
import { DashboardsService } from "./dashboards.service";

@Controller("dashboards")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class DashboardsController {
  constructor(
    @Inject(DashboardsService) private readonly dashboards: DashboardsService
  ) {}

  @Get("catalog")
  @Header("Cache-Control", "private, no-store")
  @RequirePermissions("reports.read")
  readCatalog(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    this.requireTenantSession(query, request);
    return dashboardCatalog();
  }

  @Get("volume")
  @Header("Cache-Control", "private, no-store")
  @RequirePermissions("reports.read")
  readVolume(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.dashboards.readVolume(
      this.requireTenantSession(query, request)
    );
  }

  private requireTenantSession(
    query: Record<string, unknown>,
    request: AuthenticatedRequest
  ): string {
    if (!request.auth) {
      throw new UnauthorizedException({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sessão autenticada obrigatória.",
      });
    }
    if (Object.keys(query).length > 0) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Endpoints de dashboard não aceitam parâmetros de consulta.",
      });
    }

    // API keys currently clear their creator's superuser attribute.
    // Until break-glass is approved, accept only non-superuser sessions.
    if (
      request.auth.authMethod !== "session" ||
      request.auth.isSuperuser !== false
    ) {
      throw new ForbiddenException({
        code: "DASHBOARD_ACCESS_NOT_AVAILABLE",
        message: "Acesso ao dashboard indisponível para esta credencial.",
      });
    }

    assertValidTenantContext(request.auth.organizationId);
    return request.auth.organizationId;
  }
}
