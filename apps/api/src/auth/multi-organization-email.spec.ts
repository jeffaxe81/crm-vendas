import { randomUUID } from "node:crypto";
import { AuthService } from "./auth.service";
import { OrganizationUsersService } from "../users/organization-users.service";
import type { PrismaService } from "../database/prisma.service";
import type { PasswordService } from "./password.service";
import type { TokenService } from "./token.service";
import type { AuditService } from "../audit/audit.service";

// In-memory persistence exercises the services without a database dependency.
function fixture() {
  const user = {
    id: randomUUID(),
    email: "shared@example.test",
    emailNormalized: "shared@example.test",
    displayName: "Original",
    passwordHash: "original-hash",
    isActive: true,
  };
  const organizations = [
    { id: randomUUID(), name: "First", slug: "first", isActive: true },
  ];
  const memberships = [
    {
      id: randomUUID(),
      userId: user.id,
      organizationId: organizations[0]!.id,
      role: "ADMIN",
      isActive: true,
    },
  ];
  const sessions: Record<string, unknown>[] = [];
  const prisma = {
    user: {
      findUnique: async () => user,
      create: async () => {
        throw new Error("Existing identity must not be recreated");
      },
    },
    organization: {
      findUnique: async ({ where }: any) =>
        organizations.find(o => o.slug === where.slug) ?? null,
      create: async ({ data }: any) => {
        const org = { id: randomUUID(), isActive: true, ...data };
        organizations.push(org);
        return org;
      },
      update: async () => organizations.at(-1),
    },
    organizationMembership: {
      findFirst: async ({ where }: any) => {
        const m = memberships.find(
          m =>
            m.userId === where.userId &&
            (!where.organizationId || m.organizationId === where.organizationId)
        );
        return m
          ? {
              ...m,
              organization: organizations.find(o => o.id === m.organizationId)!,
            }
          : null;
      },
      findMany: async ({ where }: any) =>
        memberships
          .filter(
            m =>
              m.userId === where.userId &&
              m.isActive &&
              organizations.some(
                o =>
                  o.id === m.organizationId &&
                  o.isActive &&
                  (!where.organization?.slug ||
                    o.slug === where.organization.slug)
              )
          )
          .map(m => ({
            ...m,
            organization: organizations.find(o => o.id === m.organizationId)!,
          })),
      create: async ({ data }: any) => {
        const membership = { id: randomUUID(), isActive: true, ...data };
        memberships.push(membership);
        return membership;
      },
    },
    refreshSession: {
      create: async ({ data }: any) => {
        const session = { id: randomUUID(), ...data };
        sessions.push(session);
        return session;
      },
    },
    $transaction: async (callback: any) => callback(prisma),
  };
  const passwords = {
    verify: async (hash: string, password: string) =>
      hash === "original-hash" && password === "Original-password-2026!",
    hash: async () => "new-hash",
  };
  const tokens = {
    createRefreshToken: () => "refresh",
    hashRefreshToken: () => "hash",
    signAccessToken: async () => "access",
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 3600,
  };
  const audit = { record: async () => undefined };
  const auth = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
    audit as unknown as AuditService
  );
  const users = new OrganizationUsersService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    audit as unknown as AuditService
  );
  const context = {
    organizationId: randomUUID(),
    actorUserId: randomUUID(),
    requestId: "test",
  };
  const register = {
    organizationName: "Second",
    adminEmail: " SHARED@example.test ",
    adminDisplayName: "Different name",
    adminPassword: "Original-password-2026!",
  };
  return {
    user,
    organizations,
    memberships,
    sessions,
    auth,
    users,
    context,
    register,
  };
}

describe("Email shared across organizations", () => {
  it("registers another organization with the existing authenticated identity", async () => {
    const f = fixture();
    const result = await f.auth.register(f.register, f.context);
    expect(result.response.user.id).toBe(f.user.id);
    expect(result.response.organization.slug).toBe("second");
    expect(f.memberships).toHaveLength(2);
    expect(f.user.passwordHash).toBe("original-hash");
    expect(f.user.displayName).toBe("Original");
  });
  it("rejects registration with another person's password before creating an organization", async () => {
    const f = fixture();
    await expect(
      f.auth.register(
        { ...f.register, adminPassword: "Wrong-password-2026!" },
        f.context
      )
    ).rejects.toMatchObject({ status: 401 });
    expect(f.organizations).toHaveLength(1);
    expect(f.sessions).toHaveLength(0);
  });
  it("links an existing user to another tenant without changing credentials or other roles", async () => {
    const f = fixture();
    const result = await f.users.create(
      {
        email: " SHARED@example.test ",
        displayName: "Changed",
        password: "Another-password-2026!",
        role: "VIEWER",
      },
      f.context
    );
    expect(result.user.id).toBe(f.user.id);
    expect(result.role).toBe("VIEWER");
    expect(f.memberships[0]!.role).toBe("ADMIN");
    expect(f.user.passwordHash).toBe("original-hash");
    expect(f.user.displayName).toBe("Original");
  });
  it("still rejects duplicate membership inside the same tenant", async () => {
    const f = fixture();
    await expect(
      f.users.create(
        {
          email: f.user.email,
          displayName: "Name",
          password: "Another-password-2026!",
          role: "VIEWER",
        },
        { ...f.context, organizationId: f.organizations[0]!.id }
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(f.memberships).toHaveLength(1);
  });
  it("requires tenant selection when multiple active memberships exist", async () => {
    const f = fixture();
    await f.auth.register(f.register, f.context);
    f.sessions.length = 0;
    await expect(
      f.auth.login(
        { email: f.user.email, password: f.register.adminPassword },
        f.context
      )
    ).rejects.toMatchObject({ response: { code: "ORGANIZATION_REQUIRED" } });
    expect(f.sessions).toHaveLength(0);
  });
  it("issues a session only for the explicitly selected tenant", async () => {
    const f = fixture();
    await f.auth.register(f.register, f.context);
    const result = await f.auth.login(
      {
        email: f.user.email,
        password: f.register.adminPassword,
        organizationSlug: " SECOND ",
      },
      f.context
    );
    expect(result.response.organization.slug).toBe("second");
    expect(f.sessions.at(-1)!.organizationId).toBe(f.organizations[1]!.id);
    await expect(
      f.auth.login(
        {
          email: f.user.email,
          password: f.register.adminPassword,
          organizationSlug: "unrelated",
        },
        f.context
      )
    ).rejects.toMatchObject({ status: 403 });
  });
  it("preserves login without tenant selection for one active membership", async () => {
    const f = fixture();
    const result = await f.auth.login(
      { email: f.user.email, password: f.register.adminPassword },
      f.context
    );
    expect(result.response.organization.slug).toBe("first");
  });
});
