import {
  CompanyCreateInputSchema,
  CompanyUpdateInputSchema,
  PaginationQuerySchema,
  type CompanyCreateInput,
  type CompanyUpdateInput,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { CompaniesService } from "./companies.service";

const CompanyListQuerySchema = PaginationQuerySchema.extend({
  sortBy: z.enum(["legalName", "createdAt", "updatedAt"]).default("legalName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const CompanyIdSchema = z.string().uuid();

type CompanyRequest = AuthenticatedRequest & RequestWithId;
type CompanyListQuery = z.infer<typeof CompanyListQuerySchema>;

@Controller("companies")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class CompaniesController {
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) {}

  @Get()
  @RequirePermissions("company.read")
  list(@Query() query: Record<string, unknown>, @Req() request: CompanyRequest) {
    return this.companies.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("company.read")
  read(@Param("id") id: string, @Req() request: CompanyRequest) {
    return this.companies.read(
      this.parseCompanyId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("company.write")
  create(@Body() body: unknown, @Req() request: CompanyRequest) {
    return this.companies.create(this.parseCreate(body), this.contextFrom(request));
  }

  @Patch(":id")
  @RequirePermissions("company.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: CompanyRequest
  ) {
    return this.companies.update(
      this.parseCompanyId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("company.write")
  async remove(
    @Param("id") id: string,
    @Req() request: CompanyRequest
  ): Promise<void> {
    await this.companies.remove(
      this.parseCompanyId(id),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): CompanyListQuery {
    const parsed = CompanyListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseCompanyId(id: string): string {
    const parsed = CompanyIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de empresa inválido.",
      });
    }
    return parsed.data;
  }

  private parseCreate(body: unknown): CompanyCreateInput {
    const parsed = CompanyCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): CompanyUpdateInput {
    const parsed = CompanyUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: CompanyRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: CompanyRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
