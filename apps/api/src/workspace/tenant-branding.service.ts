import {
  defaultBranding,
  TenantBrandingSchema,
  type TenantBranding,
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
export class TenantBrandingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private requireSession(actor: AuthenticatedPrincipal) {
    if (actor.authMethod !== "session")
      throw new ForbiddenException("Exige sessão de usuário.");
  }
  async read(actor: AuthenticatedPrincipal): Promise<TenantBranding> {
    this.requireSession(actor);
    return this.prisma.withTenant(actor.organizationId, async tx => {
      const row = await tx.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
      });
      const parsed = TenantBrandingSchema.safeParse(row.branding);
      return parsed.success ? parsed.data : { ...defaultBranding };
    });
  }
  async save(
    body: unknown,
    actor: AuthenticatedPrincipal,
    requestId: string
  ): Promise<TenantBranding> {
    this.requireSession(actor);
    if (
      actor.role !== "ADMIN" ||
      !actor.permissions.includes("organization.manage")
    )
      throw new ForbiddenException(
        "Somente administradores podem alterar a identidade visual."
      );
    const parsed = TenantBrandingSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        "Logo ou cores inválidos. Use PNG/JPEG de até 256 KB e cores hexadecimais."
      );
    await this.prisma.withTenant(actor.organizationId, async tx => {
      await tx.organization.update({
        where: { id: actor.organizationId },
        data: { branding: parsed.data },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          requestId,
          action: "organization.branding.updated",
          entityType: "organization",
          entityId: actor.organizationId,
          metadata: { hasLogo: Boolean(parsed.data.logo) },
        },
      });
    });
    return parsed.data;
  }
}
