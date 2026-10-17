import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const Input = z.object({
  action: z.enum(["list", "grant", "revoke", "password"]),
  organizationSlug: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  password: z.string().min(12).max(1024).optional(),
  confirm: z.literal("CONFIRMAR").optional(),
}).strict();

async function main() {
  const input = Input.parse(JSON.parse(readFileSync(0, "utf8")));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  // Administrative database access is required; never use the application's RLS role.
  const prisma = new PrismaService(process.env.DATABASE_URL);
  try {
    if (input.action !== "list" && input.confirm !== "CONFIRMAR") throw new Error("Confirmação obrigatória.");
    const organization = await prisma.organization.findUnique({
      where: { slug: input.organizationSlug.toLowerCase() },
    });
    if (!organization || !organization.isActive) throw new Error("Empresa inexistente ou inativa.");
    if (input.action === "list") {
      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId: organization.id },
        orderBy: { user: { displayName: "asc" } },
        select: {
          role: true, isSuperuser: true, isActive: true,
          user: { select: { email: true, displayName: true, isActive: true } },
        },
      });
      for (const member of memberships) {
        console.log(JSON.stringify({
          name: member.user.displayName, email: member.user.email,
          role: member.role, superuser: member.isSuperuser,
          active: member.isActive && member.user.isActive,
        }));
      }
      return;
    }
    if (!input.email) throw new Error("E-mail obrigatório.");
    const emailNormalized = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { emailNormalized } });
    if (input.action === "grant" && !existing && (!input.displayName || !input.password))
      throw new Error("Novo usuário exige nome e senha (mínimo 12 caracteres).");
    if (input.action !== "grant" && !existing) throw new Error("Usuário não encontrado.");
    const passwords = new PasswordService();
    const hash = input.password ? await passwords.hash(input.password) : null;
    if (input.action === "password" && !hash) throw new Error("Senha obrigatória.");
    const outcome = await prisma.$transaction(async tx => {
      const user = existing ?? await tx.user.create({
        data: { email: input.email, emailNormalized, displayName: input.displayName!, passwordHash: hash! },
      });
      const membership = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      });
      if (input.action !== "grant" && !membership)
        throw new Error("O usuário não pertence à empresa informada.");
      if (input.action === "grant") {
        if (membership) await tx.organizationMembership.update({
          where: { id: membership.id }, data: { role: "ADMIN", isSuperuser: true, isActive: true },
        });
        else await tx.organizationMembership.create({
          data: { organizationId: organization.id, userId: user.id, role: "ADMIN", isSuperuser: true },
        });
      } else if (input.action === "revoke") {
        await tx.organizationMembership.update({
          where: { id: membership!.id }, data: { isSuperuser: false },
        });
      } else {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash!, isActive: true } });
      }
      if (input.action === "password" || input.action === "revoke")
        await tx.refreshSession.deleteMany({
          where: { userId: user.id, ...(input.action === "revoke" ? { organizationId: organization.id } : {}) },
        });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id, actorUserId: user.id,
          requestId: "local-operator-superuser-manager",
          action: input.action === "grant" ? "system.provision_superuser" : input.action === "revoke" ? "system.revoke_superuser" : "system.admin_password_reset",
          entityType: "organization_membership", entityId: membership?.id ?? user.id,
          metadata: { operator: "local-server-administrator", action: input.action },
        },
      });
      return { organization: organization.slug, user: user.email, action: input.action };
    });
    console.log(JSON.stringify({ ok: true, ...outcome }));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error("Operação não concluída:", error instanceof Error ? error.message : "erro inesperado");
  process.exitCode = 1;
});
