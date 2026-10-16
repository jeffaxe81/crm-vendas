import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { LanguageSettingsSchema, type LanguageSettings } from "@axes/contracts";
import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

@Controller("organization/language-settings")
@UseGuards(AuthenticationGuard)
export class LanguageSettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    if (request.auth.authMethod !== "session")
      throw new ForbiddenException("Exige sessão de usuário.");
    return request.auth;
  }

  @Get()
  async read(@Req() request: AuthenticatedRequest): Promise<LanguageSettings> {
    const actor = this.principal(request);
    return this.prisma.withTenant(actor.organizationId, async tx => {
      const row = await tx.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
        select: { defaultLanguage: true, detectBrowserLanguage: true },
      });
      return LanguageSettingsSchema.parse(row);
    });
  }

  @Put()
  async update(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown
  ): Promise<LanguageSettings> {
    const actor = this.principal(request);
    if (!actor.permissions.includes("organization.manage"))
      throw new ForbiddenException();
    const parsed = LanguageSettingsSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Configuração de idioma inválida.");
    return this.prisma.withTenant(actor.organizationId, async tx => {
      await tx.organization.update({
        where: { id: actor.organizationId },
        data: parsed.data,
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          requestId: request.requestId ?? "language-settings",
          action: "organization.language.updated",
          entityType: "organization",
          entityId: actor.organizationId,
          metadata: parsed.data,
        },
      });
      return parsed.data;
    });
  }
}
