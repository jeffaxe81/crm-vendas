import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import type { PrismaService } from "../database/prisma.service";
import { LanguageSettingsController } from "./language-settings.controller";

describe("tenant language settings", () => {
  const request = (
    org = "tenant-a",
    permissions = ["organization.manage"],
    authMethod = "session"
  ) =>
    ({
      requestId: "language-test",
      auth: { organizationId: org, userId: "admin", permissions, authMethod },
    }) as unknown as AuthenticatedRequest;
  const settings = { defaultLanguage: "es", detectBrowserLanguage: true };
  let controller: LanguageSettingsController;
  let organizations: Map<string, unknown>;
  let audits: Record<string, unknown>[];
  beforeEach(() => {
    organizations = new Map();
    audits = [];
    const tenant = {
      organization: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
          organizations.get(where.id) ?? {
            defaultLanguage: "pt-BR",
            detectBrowserLanguage: false,
          },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: unknown;
        }) => {
          organizations.set(where.id, data);
          return data;
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data);
        },
      },
    };
    controller = new LanguageSettingsController({
      withTenant: async (_org: string, run: (tx: unknown) => unknown) =>
        run(tenant),
    } as unknown as PrismaService);
  });
  it("persists settings for one tenant without changing another, with an audit entry", async () => {
    expect(await controller.read(request())).toEqual({
      defaultLanguage: "pt-BR",
      detectBrowserLanguage: false,
    });
    expect(await controller.update(request(), settings)).toEqual(settings);
    expect(await controller.read(request())).toEqual(settings);
    expect(await controller.read(request("tenant-b"))).toEqual({
      defaultLanguage: "pt-BR",
      detectBrowserLanguage: false,
    });
    expect(audits).toEqual([
      expect.objectContaining({
        organizationId: "tenant-a",
        actorUserId: "admin",
        action: "organization.language.updated",
      }),
    ]);
  });
  it("allows ordinary authenticated users to read policy but forbids changes", async () => {
    expect(await controller.read(request("tenant-a", []))).toEqual({
      defaultLanguage: "pt-BR",
      detectBrowserLanguage: false,
    });
    await expect(
      controller.update(request("tenant-a", []), settings)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(organizations.size).toBe(0);
  });
  it("rejects absent sessions and API keys", async () => {
    await expect(
      controller.read({} as AuthenticatedRequest)
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.update(
        request("tenant-a", ["organization.manage"], "api_key"),
        settings
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([
    { ...settings, organizationId: "tenant-b" },
    { ...settings, defaultLanguage: "fr" },
    { ...settings, detectBrowserLanguage: "true" },
  ])("rejects invalid or cross-tenant input without writing", async input => {
    await expect(controller.update(request(), input)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(organizations.size).toBe(0);
    expect(audits).toHaveLength(0);
  });
});
