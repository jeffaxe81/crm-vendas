import { createDefaultWorkspacePreferences } from "@axes/contracts";
import type { PrismaService } from "../database/prisma.service";
import type { AuthenticatedPrincipal } from "../authorization/authenticated-request";
import { WorkspacePreferencesService } from "./workspace-preferences.service";
const principal: AuthenticatedPrincipal = {
  userId: "user-a",
  organizationId: "org-a",
  membershipId: "member-a",
  role: "ADMIN",
  sessionId: "session-a",
  permissions: ["company.read"],
  authMethod: "session",
};
function setup(saved: unknown = null) {
  const calls: any[] = [];
  const prisma = {
    withTenant: async (org: string, callback: any) => {
      calls.push(org);
      return callback({
        userWorkspacePreference: {
          findUnique: async (args: any) => {
            calls.push(args);
            return saved ? { preferences: saved } : null;
          },
          upsert: async (args: any) => {
            calls.push(args);
            return { preferences: args.create.preferences };
          },
        },
        auditLog: {
          create: async (args: any) => {
            calls.push(args);
            return {};
          },
        },
      });
    },
  } as unknown as PrismaService;
  return { service: new WorkspacePreferencesService(prisma), calls };
}
describe("Workspace preferences service", () => {
  it("uses only principal identity and returns defaults", async () => {
    const { service, calls } = setup();
    expect(await service.read(principal)).toEqual(
      createDefaultWorkspacePreferences()
    );
    expect(calls[0]).toBe("org-a");
    expect(calls[1]).toEqual({
      where: {
        organizationId_userId: { organizationId: "org-a", userId: "user-a" },
      },
    });
  });
  it("rejects machine credentials", async () => {
    const { service, calls } = setup();
    await expect(
      service.read({ ...principal, authMethod: "api_key" })
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
  it("rejects a destination the user cannot access", async () => {
    const { service, calls } = setup();
    await expect(
      service.save(
        { ...createDefaultWorkspacePreferences(), favorites: ["admin-users"] },
        principal,
        "request-a"
      )
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
  it("upserts only the owner and audits in the same tenant transaction", async () => {
    const { service, calls } = setup();
    const input = {
      ...createDefaultWorkspacePreferences(),
      favorites: ["companies" as const],
    };
    expect(await service.save(input, principal, "request-a")).toEqual(input);
    expect(calls[1].where).toEqual({
      organizationId_userId: { organizationId: "org-a", userId: "user-a" },
    });
    expect(calls[2].data).toMatchObject({
      actorUserId: "user-a",
      organizationId: "org-a",
      action: "workspace.preferences.updated",
    });
  });
  it("recovers from invalid stored JSON", async () => {
    const { service } = setup({ version: 100 });
    expect(await service.read(principal)).toEqual(
      createDefaultWorkspacePreferences()
    );
  });
});
