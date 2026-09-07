import {
  ContactChannelInputSchema,
  ContactCreateInputSchema,
  ContactUpdateInputSchema,
  PaginationQuerySchema,
  type ContactChannelInput,
  type ContactCreateInput,
  type ContactUpdateInput,
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
import { ContactsService } from "./contacts.service";

const ContactListQuerySchema = PaginationQuerySchema.extend({
  sortBy: z.enum(["fullName", "createdAt", "updatedAt"]).default("fullName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const ContactIdSchema = z.string().uuid();
const ChannelIdSchema = z.string().uuid();

type ContactRequest = AuthenticatedRequest & RequestWithId;
type ContactListQuery = z.infer<typeof ContactListQuerySchema>;

@Controller("contacts")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions("contact.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: ContactRequest
  ) {
    return this.contacts.list(
      this.parseListQuery(query),
      this.requirePrincipal(request).organizationId
    );
  }

  @Get(":id")
  @RequirePermissions("contact.read")
  read(@Param("id") id: string, @Req() request: ContactRequest) {
    return this.contacts.read(
      this.parseContactId(id),
      this.requirePrincipal(request).organizationId
    );
  }

  @Post()
  @RequirePermissions("contact.write")
  create(@Body() body: unknown, @Req() request: ContactRequest) {
    return this.contacts.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("contact.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: ContactRequest
  ) {
    return this.contacts.update(
      this.parseContactId(id),
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("contact.write")
  async remove(
    @Param("id") id: string,
    @Req() request: ContactRequest
  ): Promise<void> {
    await this.contacts.remove(
      this.parseContactId(id),
      this.contextFrom(request)
    );
  }

  @Post(":id/channels")
  @RequirePermissions("contact.write")
  createChannel(
    @Param("id") contactId: string,
    @Body() body: unknown,
    @Req() request: ContactRequest
  ) {
    return this.contacts.createChannel(
      this.parseContactId(contactId),
      this.parseChannel(body),
      this.contextFrom(request)
    );
  }

  @Patch(":id/channels/:channelId")
  @RequirePermissions("contact.write")
  updateChannel(
    @Param("id") contactId: string,
    @Param("channelId") channelId: string,
    @Body() body: unknown,
    @Req() request: ContactRequest
  ) {
    return this.contacts.updateChannel(
      this.parseContactId(contactId),
      this.parseChannelId(channelId),
      this.parseChannel(body),
      this.contextFrom(request)
    );
  }

  @Delete(":id/channels/:channelId")
  @HttpCode(204)
  @RequirePermissions("contact.write")
  async removeChannel(
    @Param("id") contactId: string,
    @Param("channelId") channelId: string,
    @Req() request: ContactRequest
  ): Promise<void> {
    await this.contacts.removeChannel(
      this.parseContactId(contactId),
      this.parseChannelId(channelId),
      this.contextFrom(request)
    );
  }

  private parseListQuery(query: Record<string, unknown>): ContactListQuery {
    const parsed = ContactListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseContactId(id: string): string {
    const parsed = ContactIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de contato inválido.",
      });
    }
    return parsed.data;
  }

  private parseChannelId(id: string): string {
    const parsed = ChannelIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Identificador de canal inválido.",
      });
    }
    return parsed.data;
  }

  private parseCreate(body: unknown): ContactCreateInput {
    const parsed = ContactCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): ContactUpdateInput {
    const parsed = ContactUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseChannel(body: unknown): ContactChannelInput {
    const parsed = ContactChannelInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: ContactRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: ContactRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
