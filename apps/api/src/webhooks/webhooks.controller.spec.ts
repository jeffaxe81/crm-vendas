import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { DeniedAccessLogger } from "../audit/denied-access.logger";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { REQUIRED_PERMISSIONS_KEY } from "../authorization/require-permissions.decorator";
import { WebhooksController } from "./webhooks.controller";
import type { WebhooksService } from "./webhooks.service";

const reflector = new Reflector();
const guard = new PermissionsGuard(reflector, {
  recordDeniedAccess: async () => {},
} as unknown as DeniedAccessLogger);
function context(
  method: "list" | "history" | "create" | "update" | "test",
  permissions: string[]
): ExecutionContext {
  return {
    getHandler: () => WebhooksController.prototype[method],
    getClass: () => WebhooksController,
    switchToHttp: () => ({
      getRequest: () => ({ auth: { permissions }, headers: {} }),
    }),
  } as unknown as ExecutionContext;
}
describe("webhook controller authorization", () => {
  it.each(["list", "history"] as const)(
    "allows integration.read to %s",
    async method => {
      expect(
        await guard.canActivate(context(method, ["integration.read"]))
      ).toBe(true);
      expect(
        reflector.get(
          REQUIRED_PERMISSIONS_KEY,
          WebhooksController.prototype[method]
        )
      ).toEqual(["integration.read"]);
    }
  );
  it.each(["create", "update", "test"] as const)(
    "requires integration.manage to %s even for a read-only ADMIN API key",
    async method => {
      await expect(
        guard.canActivate(context(method, ["integration.read"]))
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        await guard.canActivate(context(method, ["integration.manage"]))
      ).toBe(true);
    }
  );
  it.each(["list", "history", "create", "update", "test"] as const)(
    "denies missing integration permissions for %s",
    async method => {
      await expect(
        guard.canActivate(context(method, []))
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  );
  it("rejects client tenant/secret injection and invalid identifiers before invoking management", () => {
    const controller = new WebhooksController({} as WebhooksService);
    const request = {} as Parameters<WebhooksController["create"]>[1];
    expect(() =>
      controller.create(
        {
          name: "ERP",
          targetUrl: "https://example.com",
          eventTypes: ["company.created"],
          organizationId: "other",
        },
        request
      )
    ).toThrow(BadRequestException);
    expect(() =>
      controller.test(
        "c85d9a6b-1b11-4dea-9be4-b9f8b07434b5",
        { targetUrl: "https://example.com" },
        request
      )
    ).toThrow(BadRequestException);
    expect(() =>
      controller.update("garbage", { version: 1, name: "Changed" }, request)
    ).toThrow(BadRequestException);
    expect(() =>
      controller.update(
        "c85d9a6b-1b11-4dea-9be4-b9f8b07434b5",
        { version: 1, plainSecret: "injection" },
        request
      )
    ).toThrow(BadRequestException);
  });
});
