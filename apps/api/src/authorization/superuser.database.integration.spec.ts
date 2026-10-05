import {
  Controller,
  Get,
  UseGuards,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../database/prisma.service";
import { ApiErrorFilter } from "../errors/api-error.filter";
import { generateApiKey, hashApiKey } from "./api-key-hash";
import { AuthenticationGuard } from "./authentication.guard";
import { AuthorizationModule } from "./authorization.module";
import { SuperuserGuard } from "./superuser.guard";

// This probe is registered only in the test application, never in AppModule.
@Controller("test/superuser")
@UseGuards(AuthenticationGuard, SuperuserGuard)
class SuperuserProbeController {
  @Get()
  read() {
    return { allowed: true };
  }
}

describe("superuser SQL and HTTP boundary", () => {
  let app: INestApplication;
  let owner: PrismaService;
  let runtime: PrismaService;
  let passwords: PasswordService;
  const password = "Strong-Superuser-Test-2026!";

  beforeAll(async () => {
    if (!process.env.RLS_DATABASE_URL) {
      throw new Error(
        "RLS_DATABASE_URL is required for the restricted-role test."
      );
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthorizationModule],
      controllers: [SuperuserProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    app.setGlobalPrefix("api/v1");
    await app.init();
    passwords = moduleRef.get(PasswordService);
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    runtime = new PrismaService(process.env.RLS_DATABASE_URL);
  });

  async function reset() {
    await owner.$executeRawUnsafe(
      'TRUNCATE TABLE "audit_logs", "refresh_sessions", "organization_memberships", "users", "organizations" CASCADE'
    );
  }
  beforeEach(reset);
  afterAll(async () => {
    if (owner) {
      await reset();
      await owner.onModuleDestroy();
    }
    await runtime?.onModuleDestroy();
    await app?.close();
  });

  async function fixture() {
    const organization = await owner.organization.create({
      data: { name: "Superuser A", slug: "superuser-a" },
    });
    const otherOrganization = await owner.organization.create({
      data: { name: "Superuser B", slug: "superuser-b" },
    });
    const user = await owner.user.create({
      data: {
        email: "superuser@example.test",
        emailNormalized: "superuser@example.test",
        displayName: "Synthetic administrator",
        passwordHash: await passwords.hash(password),
      },
    });
    const membership = await owner.organizationMembership.create({
      data: { organizationId: organization.id, userId: user.id, role: "ADMIN" },
    });
    await owner.organizationMembership.create({
      data: {
        organizationId: otherOrganization.id,
        userId: user.id,
        role: "ADMIN",
      },
    });
    return { organization, otherOrganization, user, membership };
  }

  async function login(slug: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "superuser@example.test",
        password,
        organizationSlug: slug,
      })
      .expect(200);
    return response.body.accessToken as string;
  }
  const probe = (token: string) =>
    request(app.getHttpServer())
      .get("/api/v1/test/superuser")
      .set("Authorization", `Bearer ${token}`);

  it("rechecks promotion and revocation on the existing session and denies other tenants and API keys", async () => {
    const { organization, otherOrganization, user, membership } =
      await fixture();
    const token = await login(organization.slug);
    await probe(token).expect(403);
    await owner.organizationMembership.update({
      where: { id: membership.id },
      data: { isSuperuser: true },
    });
    await probe(token).expect(200);
    const otherToken = await login(otherOrganization.slug);
    await probe(otherToken).expect(403);

    const { plainKey, keyPrefix } = generateApiKey();
    await owner.integrationCredential.create({
      data: {
        organizationId: organization.id,
        name: "Synthetic machine key",
        keyHash: hashApiKey(plainKey),
        keyPrefix,
        scopes: ["company.read"],
        createdBy: user.id,
      },
    });
    await probe(plainKey).expect(403);
    await owner.organizationMembership.update({
      where: { id: membership.id },
      data: { isSuperuser: false },
    });
    await probe(token).expect(403);
    await owner.organizationMembership.update({
      where: { id: membership.id },
      data: { isSuperuser: true },
    });
    await owner.refreshSession.updateMany({
      where: { organizationId: organization.id, userId: user.id },
      data: { revokedAt: new Date() },
    });
    await probe(token).expect(401);
  });

  it("prevents runtime SQL and ordinary administration payloads from delegating the flag", async () => {
    const { organization, membership } = await fixture();
    const roles = await runtime.$queryRaw<
      Array<{ rolbypassrls: boolean; rolsuper: boolean }>
    >`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user
    `;
    expect(roles).toEqual([{ rolbypassrls: false, rolsuper: false }]);
    await expect(
      runtime.withTenant(organization.id, tenant =>
        tenant.organizationMembership.update({
          where: { id: membership.id },
          data: { isSuperuser: true },
        })
      )
    ).rejects.toThrow(
      "Superuser provisioning requires the deployment database role"
    );

    const token = await login(organization.slug);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${membership.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "ADMIN", isSuperuser: true })
      .expect(200);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: membership.id },
        })
      ).isSuperuser
    ).toBe(false);
    const created = await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "new-superuser@example.test",
        displayName: "Synthetic user",
        password,
        role: "ADMIN",
        isSuperuser: true,
      })
      .expect(201);
    expect(
      (
        await owner.organizationMembership.findUniqueOrThrow({
          where: { id: created.body.membershipId },
        })
      ).isSuperuser
    ).toBe(false);
    await owner.organizationMembership.delete({
      where: { id: created.body.membershipId },
    });
    await expect(
      runtime.withTenant(organization.id, tenant =>
        tenant.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: created.body.user.id,
            role: "ADMIN",
            isSuperuser: true,
          },
        })
      )
    ).rejects.toThrow(
      "Superuser provisioning requires the deployment database role"
    );
    await owner.organizationMembership.update({
      where: { id: membership.id },
      data: { isSuperuser: true },
    });
    await expect(
      runtime.withTenant(organization.id, tenant =>
        tenant.organizationMembership.update({
          where: { id: membership.id },
          data: { userId: created.body.user.id },
        })
      )
    ).rejects.toThrow(
      "Superuser provisioning requires the deployment database role"
    );
    await expect(
      runtime.withTenant(organization.id, tenant =>
        tenant.organizationMembership.update({
          where: { id: membership.id },
          data: { isSuperuser: false },
        })
      )
    ).rejects.toThrow(
      "Superuser provisioning requires the deployment database role"
    );
  });
});
