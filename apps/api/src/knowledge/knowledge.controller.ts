import {
  KnowledgeCreateInputSchema,
  KnowledgeListQuerySchema,
  KnowledgeUpdateInputSchema,
  type KnowledgeCreateInput,
  type KnowledgeListQuery,
  type KnowledgeUpdateInput,
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
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { KnowledgeService } from "./knowledge.service";

type KnowledgeRequest = AuthenticatedRequest & RequestWithId;
const KnowledgeIdSchema = z.string().uuid();

@Controller("knowledge")
@UseGuards(AuthenticationGuard, PermissionsGuard)
export class KnowledgeController {
  constructor(
    @Inject(KnowledgeService) private readonly knowledge: KnowledgeService
  ) {}

  @Get()
  @RequirePermissions("knowledge.read")
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: KnowledgeRequest
  ) {
    return this.knowledge.list(
      this.parse(KnowledgeListQuerySchema, query),
      this.context(request)
    );
  }

  @Get(":id")
  @RequirePermissions("knowledge.read")
  read(@Param("id") id: string, @Req() request: KnowledgeRequest) {
    return this.knowledge.read(this.parseId(id), this.context(request));
  }

  @Get(":id/document")
  @RequirePermissions("knowledge.read")
  async document(
    @Param("id") id: string,
    @Req() request: KnowledgeRequest,
    @Res() response: Response
  ): Promise<void> {
    const document = await this.knowledge.download(
      this.parseId(id),
      this.context(request)
    );
    const name = encodeURIComponent(document.fileName);
    response.setHeader("Content-Type", document.mimeType);
    response.setHeader("X-Content-Type-Options", "nosniff");
    // Attachments may contain untrusted bytes; prevent browser execution and
    // shared caches from retaining tenant documents.
    response.setHeader("Content-Security-Policy", "sandbox");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Download-Options", "noopen");
    response.setHeader(
      "Content-Disposition",
      "attachment; filename=\"document\"; filename*=UTF-8''" + name
    );
    response.setHeader("Content-Length", document.bytes.length);
    response.send(document.bytes);
  }

  @Post()
  @RequirePermissions("knowledge.write")
  create(@Body() body: unknown, @Req() request: KnowledgeRequest) {
    return this.knowledge.create(
      this.parse(KnowledgeCreateInputSchema, body),
      this.context(request)
    );
  }

  @Patch(":id")
  @RequirePermissions("knowledge.write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: KnowledgeRequest
  ) {
    return this.knowledge.update(
      this.parseId(id),
      this.parse(KnowledgeUpdateInputSchema, body),
      this.context(request)
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("knowledge.write")
  async remove(
    @Param("id") id: string,
    @Req() request: KnowledgeRequest
  ): Promise<void> {
    await this.knowledge.remove(this.parseId(id), this.context(request));
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
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
    return this.parse(KnowledgeIdSchema, id);
  }

  private context(request: KnowledgeRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return {
      organizationId: request.auth.organizationId,
      actorUserId: request.auth.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
