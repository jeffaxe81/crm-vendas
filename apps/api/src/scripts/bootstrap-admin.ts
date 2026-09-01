import { z } from "zod";

import { PrismaService } from "../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const BootstrapEnvironmentSchema = z.object({
  BOOTSTRAP_ORG_NAME: z.string().trim().min(1).default("Axesistemas"),
  BOOTSTRAP_ORG_SLUG: z.string().trim().min(1).max(80).default("axesistemas"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(254),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(160),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(1024),
});

async function main(): Promise<void> {
  const input = BootstrapEnvironmentSchema.parse(process.env);
  const prisma = new PrismaService();
  const passwords = new PasswordService();

  try {
    const organization = await prisma.organization.upsert({
      where: { slug: input.BOOTSTRAP_ORG_SLUG.toLowerCase() },
      update: {
        name: input.BOOTSTRAP_ORG_NAME,
        isActive: true,
      },
      create: {
        name: input.BOOTSTRAP_ORG_NAME,
        slug: input.BOOTSTRAP_ORG_SLUG.toLowerCase(),
      },
    });

    const emailNormalized = input.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const passwordHash = await passwords.hash(input.BOOTSTRAP_ADMIN_PASSWORD);
    const existingUser = await prisma.user.findUnique({
      where: { emailNormalized },
    });

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            email: input.BOOTSTRAP_ADMIN_EMAIL,
            displayName: input.BOOTSTRAP_ADMIN_NAME,
            passwordHash,
            isActive: true,
          },
        })
      : await prisma.user.create({
          data: {
            email: input.BOOTSTRAP_ADMIN_EMAIL,
            emailNormalized,
            displayName: input.BOOTSTRAP_ADMIN_NAME,
            passwordHash,
          },
        });

    const existingMembership =
      await prisma.organizationMembership.findFirst({
        where: {
          organizationId: organization.id,
          userId: user.id,
        },
      });

    const membership = existingMembership
      ? await prisma.organizationMembership.update({
          where: { id: existingMembership.id },
          data: {
            role: "ADMIN",
            isActive: true,
          },
        })
      : await prisma.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: "ADMIN",
          },
        });

    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: user.id,
        requestId: "bootstrap-admin",
        action: "system.bootstrap_admin",
        entityType: "organization_membership",
        entityId: membership.id,
        metadata: {
          source: "bootstrap-admin",
        },
      },
    });

    console.log(
      JSON.stringify({
        organizationId: organization.id,
        userId: user.id,
        membershipId: membership.id,
      })
    );
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch(error => {
  console.error("Bootstrap do administrador não concluído.");
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
