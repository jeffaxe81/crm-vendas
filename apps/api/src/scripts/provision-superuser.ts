import "dotenv/config";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service";

async function main() {
  const input = z
    .object({
      MIGRATION_DATABASE_URL: z.string().url(),
      SUPERUSER_ORGANIZATION_ID: z.string().uuid(),
      SUPERUSER_USER_ID: z.string().uuid(),
      SUPERUSER_ENABLED: z.enum(["true", "false"]),
    })
    .parse(process.env);
  const prisma = new PrismaService(input.MIGRATION_DATABASE_URL);
  try {
    await prisma.$transaction(async tx => {
      const membership = await tx.organizationMembership.update({
        where: {
          organizationId_userId: {
            organizationId: input.SUPERUSER_ORGANIZATION_ID,
            userId: input.SUPERUSER_USER_ID,
          },
        },
        data: { isSuperuser: input.SUPERUSER_ENABLED === "true" },
      });
      await tx.auditLog.create({
        data: {
          organizationId: membership.organizationId,
          actorUserId: membership.userId,
          requestId: "deployment-provision-superuser",
          action: "system.provision_superuser",
          entityType: "organization_membership",
          entityId: membership.id,
          metadata: { enabled: membership.isSuperuser },
        },
      });
    });
    console.log("Associação de Superusuário atualizada.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error("Provisionamento de Superusuário não concluído.");
  process.exitCode = 1;
});
