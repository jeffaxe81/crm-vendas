import {
  WorkspacePreferencesSchema,
  createDefaultWorkspacePreferences,
  availableWorkspaceDestinations,
  type WorkspacePreferences,
} from "@axes/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class WorkspacePreferencesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private requireSession(principal: AuthenticatedPrincipal) {
    if (principal.authMethod !== "session")
      throw new ForbiddenException(
        "Preferências pessoais exigem sessão de usuário."
      );
  }
  async read(principal: AuthenticatedPrincipal): Promise<WorkspacePreferences> {
    this.requireSession(principal);
    return this.prisma.withTenant(principal.organizationId, async tenant => {
      const row = await tenant.userWorkspacePreference.findUnique({
        where: {
          organizationId_userId: {
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        },
      });
      const parsed = WorkspacePreferencesSchema.safeParse(row?.preferences);
      return parsed.success ? parsed.data : createDefaultWorkspacePreferences();
    });
  }
  async save(
    input: WorkspacePreferences,
    principal: AuthenticatedPrincipal,
    requestId: string
  ): Promise<WorkspacePreferences> {
    this.requireSession(principal);
    const parsed = WorkspacePreferencesSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Preferências inválidas.");
    const allowed = new Set(
      availableWorkspaceDestinations(principal.permissions).map(item => item.id)
    );
    if (
      !allowed.has(parsed.data.defaultSection) ||
      parsed.data.favorites.some(id => !allowed.has(id))
    )
      throw new BadRequestException(
        "Destino indisponível para suas permissões atuais."
      );
    return this.prisma.withTenant(principal.organizationId, async tenant => {
      await tenant.userWorkspacePreference.upsert({
        where: {
          organizationId_userId: {
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        },
        create: {
          organizationId: principal.organizationId,
          userId: principal.userId,
          preferences: parsed.data,
        },
        update: { preferences: parsed.data },
      });
      await tenant.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          requestId,
          action: "workspace.preferences.updated",
          entityType: "user_workspace_preference",
          metadata: { version: 1 },
        },
      });
      return parsed.data;
    });
  }
}
