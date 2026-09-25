import {
  SalesByProductQuerySchema,
  type SalesByProductQuery,
} from "@axes/contracts";
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { ManagementSummaryService } from "./management-summary.service";
import { SalesByProductService } from "./sales-by-product.service";
import {
  formatSalesByProductCsv,
  salesByProductCsvFilename,
} from "./sales-by-product-csv";
import { SalesByProductOwnersService } from "./sales-by-product-owners.service";

@Controller("reports")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    @Inject(ManagementSummaryService)
    private readonly managementSummary: ManagementSummaryService,
    @Inject(SalesByProductService)
    private readonly salesByProduct: SalesByProductService,
    @Inject(SalesByProductOwnersService)
    private readonly salesByProductOwners: SalesByProductOwnersService
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

  @Get("sales-by-product")
  @RequirePermissions("reports.read")
  readSalesByProduct(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    const parsed = this.parseSalesByProductQuery(query);

    if (!request.auth) {
      throw new UnauthorizedException({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sessão autenticada obrigatória.",
      });
    }

    return this.salesByProduct.read(request.auth.organizationId, parsed);
  }

  private parseSalesByProductQuery(
    query: Record<string, unknown>
  ): SalesByProductQuery {
    const parsed = SalesByProductQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  @Get("sales-by-product/export")
  @RequirePermissions("reports.read")
  async exportSalesByProduct(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<string> {
    const parsed = this.parseSalesByProductQuery(query);
    const organizationId = this.requireOrganizationId(request);
    const report = await this.salesByProduct.read(organizationId, parsed);

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${salesByProductCsvFilename(report.asOf)}"`
    );
    response.setHeader("Cache-Control", "no-store");
    return formatSalesByProductCsv(report);
  }

  @Get("sales-by-product/owners")
  @RequirePermissions("reports.read")
  listSalesByProductOwners(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    if (Object.keys(query).length > 0) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "A lista de responsáveis não aceita parâmetros de consulta.",
      });
    }
    return this.salesByProductOwners.list(this.requireOrganizationId(request));
  }

  private requireOrganizationId(request: AuthenticatedRequest): string {
    if (!request.auth) {
      throw new UnauthorizedException({
        code: "AUTHENTICATION_REQUIRED",
        message: "Sessão autenticada obrigatória.",
      });
    }
    return request.auth.organizationId;
  }
}
