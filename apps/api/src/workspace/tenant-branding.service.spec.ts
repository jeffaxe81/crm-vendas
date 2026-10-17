import { defaultBranding } from "@axes/contracts";
import type { PrismaService } from "../database/prisma.service";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { TenantBrandingService } from "./tenant-branding.service";

const admin: AuthenticatedPrincipal = {
  userId: "user-a",
  organizationId: "org-a",
  membershipId: "member-a",
  role: "ADMIN",
  sessionId: "session-a",
  permissions: ["organization.manage"],
  authMethod: "session",
};
function fixture() {
  const rows = new Map<string, unknown>();
  const audits: unknown[] = [];
  const prisma = {
    withTenant: async (id: string, callback: (tx: unknown) => unknown) =>
      callback({
        organization: {
          findUniqueOrThrow: async () => ({ branding: rows.get(id) ?? null }),
          update: async ({
            where,
            data,
          }: {
            where: { id: string };
            data: { branding: unknown };
          }) => {
            if (where.id !== id) throw Error("Tenant mismatch");
            rows.set(id, data.branding);
          },
        },
        auditLog: {
          create: async (data: unknown) => {
            audits.push(data);
          },
        },
      }),
  } as unknown as PrismaService;
  return { service: new TenantBrandingService(prisma), rows, audits };
}
describe("Tenant branding", () => {
  it("returns defaults and persists independent profiles for each tenant", async () => {
    const { service } = fixture();
    expect(await service.read(admin)).toEqual(defaultBranding);
    const chosen = { ...defaultBranding, primaryColor: "#aabbcc" };
    await service.save(chosen, admin, "request-a");
    expect(await service.read(admin)).toEqual(chosen);
    expect(await service.read({ ...admin, organizationId: "org-b" })).toEqual(
      defaultBranding
    );
  });
  it("allows a member to read but denies writes without admin role and permission", async () => {
    const { service, rows } = fixture();
    const viewer = { ...admin, role: "VIEWER" as const, permissions: [] };
    expect(await service.read(viewer)).toEqual(defaultBranding);
    await expect(
      service.save(defaultBranding, viewer, "r")
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.save(defaultBranding, { ...admin, permissions: [] }, "r")
    ).rejects.toMatchObject({ status: 403 });
    expect(rows.size).toBe(0);
  });
  it("rejects API keys, foreign tenant fields and CSS or executable logos", async () => {
    const { service, rows } = fixture();
    await expect(
      service.read({ ...admin, authMethod: "api_key" })
    ).rejects.toMatchObject({ status: 403 });
    for (const body of [
      { ...defaultBranding, organizationId: "org-b" },
      { ...defaultBranding, primaryColor: "red;display:none" },
      { ...defaultBranding, logo: "data:image/svg+xml;base64,PHN2Zz4=" },
    ])
      await expect(service.save(body, admin, "r")).rejects.toMatchObject({
        status: 400,
      });
    expect(rows.size).toBe(0);
  });
  it("records the actor and organization without copying the image into audit metadata", async () => {
    const { service, audits } = fixture();
    await service.save(defaultBranding, admin, "request-a");
    expect(audits).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-a",
          actorUserId: "user-a",
          action: "organization.branding.updated",
          requestId: "request-a",
          metadata: { hasLogo: false },
        }),
      }),
    ]);
  });
});
