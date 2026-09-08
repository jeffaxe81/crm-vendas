import {
  PaginationQuerySchema,
  TagInputSchema,
  type TagInput,
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
import { TagsService, type TagListQuery } from "./tags.service";

const EntityIdSchema = z.string().uuid();
type TagRequest = AuthenticatedRequest & RequestWithId;

@Controller("tags")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  @RequirePermissions("company.read", "contact.read")
  list(@Query() query: Record<string, unknown>, @Req() request: TagRequest) {
    return this.tags.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("company.write", "contact.write")
  create(@Body() body: unknown, @Req() request: TagRequest) {
    return this.tags.create(this.parseTag(body), this.contextFrom(request));
  }

  @Patch(":id")
  @RequirePermissions("company.write", "contact.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: TagRequest
  ) {
    return this.tags.update(
      this.parseId(id, "tag"),
      this.parseTag(body),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): TagListQuery {
    const parsed = PaginationQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseTag(body: unknown): TagInput {
    const parsed = TagInputSchema.safeParse(body);
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

  private requirePrincipal(request: TagRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: TagRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}

@Controller("companies/:companyId/tags")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class CompanyTagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Post(":tagId")
  @RequirePermissions("company.write")
  link(
    @Param("companyId") companyId: string,
    @Param("tagId") tagId: string,
    @Req() request: TagRequest
  ) {
    return this.tags.linkCompany(
      this.parseId(companyId, "empresa"),
      this.parseId(tagId, "tag"),
      this.contextFrom(request)
    );
  }

  @Delete(":tagId")
  @HttpCode(204)
  @RequirePermissions("company.write")
  async unlink(
    @Param("companyId") companyId: string,
    @Param("tagId") tagId: string,
    @Req() request: TagRequest
  ): Promise<void> {
    await this.tags.unlinkCompany(
      this.parseId(companyId, "empresa"),
      this.parseId(tagId, "tag"),
      this.contextFrom(request)
    );
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

  private requirePrincipal(request: TagRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: TagRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}

@Controller("contacts/:contactId/tags")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ContactTagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Post(":tagId")
  @RequirePermissions("contact.write")
  link(
    @Param("contactId") contactId: string,
    @Param("tagId") tagId: string,
    @Req() request: TagRequest
  ) {
    return this.tags.linkContact(
      this.parseId(contactId, "contato"),
      this.parseId(tagId, "tag"),
      this.contextFrom(request)
    );
  }

  @Delete(":tagId")
  @HttpCode(204)
  @RequirePermissions("contact.write")
  async unlink(
    @Param("contactId") contactId: string,
    @Param("tagId") tagId: string,
    @Req() request: TagRequest
  ): Promise<void> {
    await this.tags.unlinkContact(
      this.parseId(contactId, "contato"),
      this.parseId(tagId, "tag"),
      this.contextFrom(request)
    );
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

  private requirePrincipal(request: TagRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: TagRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
