import {
  OpportunityItemCreateInputSchema,
  OpportunityItemUpdateInputSchema,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z, type ZodType } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { OpportunityItemsService } from "./opportunity-items.service";

const IdSchema = z.string().uuid();
const VersionQuerySchema = z.object({
  version: z.coerce.number().int().min(1),
});

type OpportunityItemRequest = AuthenticatedRequest & RequestWithId;

@Controller("opportunities/:opportunityId/items")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class OpportunityItemsController {
  constructor(
    @Inject(OpportunityItemsService)
    private readonly items: OpportunityItemsService
  ) {}

  @Get()
  @RequirePermissions("opportunity.read")
  list(
    @Param("opportunityId") opportunityId: string,
    @Req() request: OpportunityItemRequest
  ) {
    return this.items.list(
      this.parseId(opportunityId),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("opportunity.write")
  add(
    @Param("opportunityId") opportunityId: string,
    @Body() body: unknown,
    @Req() request: OpportunityItemRequest
  ) {
    return this.items.add(
      this.parseId(opportunityId),
      this.parse(OpportunityItemCreateInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Patch(":itemId")
  @RequirePermissions("opportunity.write")
  update(
    @Param("opportunityId") opportunityId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Req() request: OpportunityItemRequest
  ) {
    return this.items.update(
      this.parseId(opportunityId),
      this.parseId(itemId),
      this.parse(OpportunityItemUpdateInputSchema, body),
      this.contextFrom(request)
    );
  }

  @Delete(":itemId")
  @RequirePermissions("opportunity.write")
  remove(
    @Param("opportunityId") opportunityId: string,
    @Param("itemId") itemId: string,
    @Query() query: Record<string, unknown>,
    @Req() request: OpportunityItemRequest
  ) {
    return this.items.remove(
      this.parseId(opportunityId),
      this.parseId(itemId),
      this.parse(VersionQuerySchema, query).version,
      this.contextFrom(request)
    );
  }

  private parse<T>(schema: ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseId(id: string): string {
    const parsed = IdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador inválido.",
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: OpportunityItemRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: OpportunityItemRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
