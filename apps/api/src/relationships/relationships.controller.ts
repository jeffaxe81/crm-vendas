import {
  PaginationQuerySchema,
  RelationshipEntryCreateInputSchema,
  type RelationshipEntryCreateInput,
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
import {
  RelationshipsService,
  type RelationshipListQuery,
} from "./relationships.service";

const EntityIdSchema = z.string().uuid();
const CompanyContactInputSchema = z.object({
  relationshipLabel: z.string().trim().min(1).max(120).optional(),
  isPrimary: z.boolean().default(false),
});
const RelationshipListQuerySchema = PaginationQuerySchema.extend({
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
});

type RelationshipRequest = AuthenticatedRequest & RequestWithId;
type CompanyContactInput = z.infer<typeof CompanyContactInputSchema>;

@Controller("companies/:companyId/contacts")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class CompanyContactRelationshipsController {
  constructor(
    @Inject(RelationshipsService)
    private readonly relationships: RelationshipsService
  ) {}

  @Post(":contactId")
  @RequirePermissions("company.write", "contact.write")
  link(
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
    @Body() body: unknown,
    @Req() request: RelationshipRequest
  ) {
    return this.relationships.linkCompanyContact(
      this.parseId(companyId, "empresa"),
      this.parseId(contactId, "contato"),
      this.parseLink(body),
      this.contextFrom(request)
    );
  }

  @Delete(":contactId")
  @HttpCode(204)
  @RequirePermissions("company.write", "contact.write")
  async unlink(
    @Param("companyId") companyId: string,
    @Param("contactId") contactId: string,
    @Req() request: RelationshipRequest
  ): Promise<void> {
    await this.relationships.unlinkCompanyContact(
      this.parseId(companyId, "empresa"),
      this.parseId(contactId, "contato"),
      this.contextFrom(request)
    );
  }

  private parseLink(body: unknown): CompanyContactInput {
    const parsed = CompanyContactInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseId(id: string, entity: string): string {
    const parsed = EntityIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: `Identificador de ${entity} inválido.`,
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: RelationshipRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: RelationshipRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}

@Controller("relationship-entries")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class RelationshipEntriesController {
  constructor(
    @Inject(RelationshipsService)
    private readonly relationships: RelationshipsService
  ) {}

  @Get()
  @RequirePermissions("company.read", "contact.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: RelationshipRequest
  ) {
    return this.relationships.listEntries(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("company.write", "contact.write")
  create(@Body() body: unknown, @Req() request: RelationshipRequest) {
    return this.relationships.createEntry(
      this.parseEntry(body),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): RelationshipListQuery {
    const parsed = RelationshipListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseEntry(body: unknown): RelationshipEntryCreateInput {
    const parsed = RelationshipEntryCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: RelationshipRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: RelationshipRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
