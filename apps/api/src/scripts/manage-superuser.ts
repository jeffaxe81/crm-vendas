import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const Input = z
  .object({
    action: z.enum(["list-all", "list", "grant", "revoke", "password"]),
    organizationSlug: z.string().trim().min(1).max(80).optional(),
    organizationName: z.string().trim().min(1).max(160).optional(),
    createOrganization: z.boolean().optional(),
    email: z.string().trim().email().max(254).optional(),
    displayName: z.string().trim().min(1).max(160).optional(),
    password: z.string().min(12).max(1024).optional(),
    confirm: z.literal("CONFIRMAR").optional(),
  })
  .strict();

async function main() {
  const input = Input.parse(JSON.parse(readFileSync(0, "utf8")));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  // Administrative database access is required; never use the application's RLS role.
  const prisma = new PrismaService(process.env.DATABASE_URL);
  try {
    if (input.action === "list-all") {
      // This is a local operator-only command, never exposed through the web API.
      // Pagination bounds memory usage for installations with many users.
      let page = 0;
      while (true) {
        const users = await prisma.user.findMany({
          orderBy: { id: "asc" },
          skip: page * 200,
          take: 200,
          select: {
            email: true,
            displayName: true,
            isActive: true,
            memberships: {
              select: {
                role: true,
                isSuperuser: true,
                isActive: true,
                organization: {
                  select: {
                    name: true,
                    slug: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });
        for (const user of users) {
          console.log(
            JSON.stringify({
              name: user.displayName,
              email: user.email,
              active: user.isActive,
              tenants: user.memberships
                .map(member => ({
                  name: member.organization.name,
                  slug: member.organization.slug,
                  role: member.role,
                  superuser: member.isSuperuser,
                  active: member.isActive && member.organization.isActive,
                }))
                .sort((a, b) => a.slug.localeCompare(b.slug)),
            })
          );
        }
        if (users.length < 200) break;
        page += 1;
      }
      return;
    }
    if (input.action !== "list" && input.confirm !== "CONFIRMAR") {
      throw new Error("Confirmação obrigatória.");
    }
    if (!input.organizationSlug) throw new Error("Empresa obrigatória.");
    const slug = input.organizationSlug.toLowerCase();
    const existingOrganization = await prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrganization && !existingOrganization.isActive) {
      throw new Error("Empresa inativa: não será reativada automaticamente.");
    }
    if (!existingOrganization) {
      if (
        input.action !== "grant" ||
        input.createOrganization !== true ||
        !input.organizationName
      ) {
        throw new Error(
          "Empresa inexistente. Autorize sua criação e informe o nome para continuar."
        );
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(
          "Slug da nova empresa deve conter letras, números e hífens."
        );
      }
    }
    if (input.action === "list") {
      const organization = existingOrganization!;

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId: organization.id },
        orderBy: { user: { displayName: "asc" } },
        select: {
          role: true,
          isSuperuser: true,
          isActive: true,
          user: {
            select: {
              email: true,
              displayName: true,
              isActive: true,
            },
          },
        },
      });
      for (const member of memberships) {
        console.log(
          JSON.stringify({
            name: member.user.displayName,
            email: member.user.email,
            role: member.role,
            superuser: member.isSuperuser,
            active: member.isActive && member.user.isActive,
          })
        );
      }
      return;
    }
    if (!input.email) throw new Error("E-mail obrigatório.");
    const emailNormalized = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { emailNormalized },
    });
    if (
      input.action === "grant" &&
      !existing &&
      (!input.displayName || !input.password)
    ) {
      throw new Error(
        "Novo usuário exige nome e senha (mínimo 12 caracteres)."
      );
    }
    if (input.action !== "grant" && !existing) {
      throw new Error("Usuário não encontrado.");
    }
    if (input.action === "grant" && existing && input.password) {
      throw new Error(
        "Usuário existente: para alterar a senha, use a opção específica."
      );
    }
    const passwords = new PasswordService();
    const hash = input.password ? await passwords.hash(input.password) : null;
    if (input.action === "password" && !hash) {
      throw new Error("Senha obrigatória.");
    }
    const outcome = await prisma.$transaction(async tx => {
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: input.email!,
            emailNormalized,
            displayName: input.displayName!,
            passwordHash: hash!,
          },
        }));
      const organization =
        existingOrganization ??
        (await tx.organization.create({
          data: {
            name: input.organizationName!,
            slug,
            onboardingOwnerId: user.id,
          },
        }));
      const membership = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
      });
      if (input.action !== "grant" && !membership) {
        throw new Error("O usuário não pertence à empresa informada.");
      }
      if (input.action === "grant") {
        if (membership) {
          await tx.organizationMembership.update({
            where: { id: membership.id },
            data: { role: "ADMIN", isSuperuser: true, isActive: true },
          });
        } else {
          await tx.organizationMembership.create({
            data: {
              organizationId: organization.id,
              userId: user.id,
              role: "ADMIN",
              isSuperuser: true,
            },
          });
        }
      } else if (input.action === "revoke") {
        await tx.organizationMembership.update({
          where: { id: membership!.id },
          data: { isSuperuser: false },
        });
      } else {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: hash!, isActive: true },
        });
      }
      if (input.action === "password" || input.action === "revoke") {
        await tx.refreshSession.deleteMany({
          where: {
            userId: user.id,
            ...(input.action === "revoke"
              ? { organizationId: organization.id }
              : {}),
          },
        });
      }
      if (!existingOrganization) {
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: user.id,
            requestId: "local-operator-superuser-manager",
            action: "organization.registered",
            entityType: "organization",
            entityId: organization.id,
            metadata: { source: "local-superuser-manager" },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: user.id,
          requestId: "local-operator-superuser-manager",
          action:
            input.action === "grant"
              ? "system.provision_superuser"
              : input.action === "revoke"
                ? "system.revoke_superuser"
                : "system.admin_password_reset",
          entityType: "organization_membership",
          entityId: membership?.id ?? user.id,
          metadata: {
            operator: "local-server-administrator",
            action: input.action,
          },
        },
      });
      return {
        organization: organization.slug,
        organizationCreated: !existingOrganization,
        user: user.email,
        action: input.action,
      };
    });
    console.log(JSON.stringify({ ok: true, ...outcome }));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error(
    "Operação não concluída:",
    error instanceof Error ? error.message : "erro inesperado"
  );
  process.exitCode = 1;
});
