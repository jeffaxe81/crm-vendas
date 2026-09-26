import {
  PaginationQuerySchema,
  TerritoryCoverageTargetInputSchema,
  TerritoryCreateInputSchema,
  TerritoryQuotaInputSchema,
  TerritoryQuotaQuerySchema,
  TerritoryReassignInputSchema,
  TerritoryUpdateInputSchema,
  type TerritoryCoverageTargetInput,
  type TerritoryCreateInput,
  type TerritoryQuotaInput,
  type TerritoryQuotaQuery,
  type TerritoryReassignInput,
  type TerritoryUpdateInput,
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
import { TerritoriesService } from "./territories.service";

const TerritoryListQuerySchema = PaginationQuerySchema.extend({
  region: z.string().trim().min(1).max(120).optional(),
  sortBy: z.enum(["name", "region", "createdAt", "updatedAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const TerritoryIdSchema = z.string().uuid();
const CoverageStatusUpdateSchema = z.object({
  coverageStatus: z.enum(["UNCOVERED", "PARTIAL", "COVERED"]),
});

type TerritoryRequest = AuthenticatedRequest & RequestWithId;
type TerritoryListQuery = z.infer<typeof TerritoryListQuerySchema>;

@Controller("territories")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class TerritoriesController {
  constructor(
    @Inject(TerritoriesService)
    private readonly territories: TerritoriesService
  ) {}

  @Get()
  @RequirePermissions("territory.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: TerritoryRequest
  ) {
    return this.territories.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("territory.read")
  read(@Param("id") id: string, @Req() request: TerritoryRequest) {
    return this.territories.read(
      this.parseId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("territory.write")
  create(@Body() body: unknown, @Req() request: TerritoryRequest) {
    return this.territories.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("territory.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TerritoryRequest
  ) {
    return this.territories.update(
      this.parseId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("territory.write")
  async remove(
    @Param("id") id: string,
    @Req() request: TerritoryRequest
  ): Promise<void> {
    await this.territories.remove(this.parseId(id), this.contextFrom(request));
  }

  @Post(":id/reassign")
  @RequirePermissions("territory.write")
  reassign(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TerritoryRequest
  ) {
    const input = this.parseReassign(body);
    return this.territories.reassign(
      this.parseId(id),
      input.salesRepId,
      this.contextFrom(request)
    );
  }

  @Get(":id/coverage")
  @RequirePermissions("territory.read")
  listCoverage(
    @Param("id") id: string,
    @Query("status") status: string | undefined,
    @Req() request: TerritoryRequest
  ) {
    return this.territories.listCoverage(
      this.parseId(id),
      this.requirePrincipal(request).organizationId,
      status
    );
  }

  @Post(":id/coverage/add")
  @RequirePermissions("territory.write")
  addCoverageTarget(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TerritoryRequest
  ) {
    return this.territories.addCoverageTarget(
      this.parseId(id),
      this.parseCoverageTargetInput(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id/coverage/:companyId")
  @RequirePermissions("territory.write")
  updateCoverageTarget(
    @Param("id") id: string,
    @Param("companyId") companyId: string,
    @Body() body: unknown,
    @Req() request: TerritoryRequest
  ) {
    const parsed = CoverageStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return this.territories.updateCoverageTarget(
      this.parseId(id),
      this.parseId(companyId),
      parsed.data.coverageStatus,
      this.contextFrom(request)
    );
  }

  @Delete(":id/coverage/:companyId")
  @HttpCode(204)
  @RequirePermissions("territory.write")
  async removeCoverageTarget(
    @Param("id") id: string,
    @Param("companyId") companyId: string,
    @Req() request: TerritoryRequest
  ): Promise<void> {
    await this.territories.removeCoverageTarget(
      this.parseId(id),
      this.parseId(companyId),
      this.contextFrom(request)
    );
  }

  @Get(":id/quotas")
  @RequirePermissions("territory.read")
  listQuotas(
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Req() request: TerritoryRequest
  ) {
    return this.territories.listQuotas(
      this.parseId(id),
      this.requirePrincipal(request).organizationId,
      this.parseQuotaQuery(query)
    );
  }

  @Post(":id/quotas")
  @RequirePermissions("territory.write")
  setQuota(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TerritoryRequest
  ) {
    return this.territories.setQuota(
      this.parseId(id),
      this.parseQuotaInput(body),
      this.contextFrom(request)
    );
  }

  @Get(":id/metrics")
  @RequirePermissions("territory.read")
  getMetrics(@Param("id") id: string, @Req() request: TerritoryRequest) {
    return this.territories.getMetrics(
      this.parseId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  private parseListQuery(query: Record<string, unknown>): TerritoryListQuery {
    const parsed = TerritoryListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseId(id: string): string {
    const parsed = TerritoryIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador inválido.",
      });
    }
    return parsed.data;
  }

  private parseCreate(body: unknown): TerritoryCreateInput {
    const parsed = TerritoryCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): TerritoryUpdateInput {
    const parsed = TerritoryUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseReassign(body: unknown): TerritoryReassignInput {
    const parsed = TerritoryReassignInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseCoverageTargetInput(
    body: unknown
  ): TerritoryCoverageTargetInput {
    const parsed = TerritoryCoverageTargetInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseQuotaInput(body: unknown): TerritoryQuotaInput {
    const parsed = TerritoryQuotaInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseQuotaQuery(query: Record<string, unknown>): TerritoryQuotaQuery {
    const parsed = TerritoryQuotaQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: TerritoryRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: TerritoryRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
