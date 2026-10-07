import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { SuperuserGuard } from "./superuser.guard";

describe("Superuser boundary", () => {
  const request = (auth: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ auth }) }),
    }) as ExecutionContext;
  const denied = { recordDeniedAccess: async () => {} };
  it.each([
    undefined,
    { role: "ADMIN", authMethod: "session", isSuperuser: false },
    { role: "ADMIN", authMethod: "session" },
    { role: "ADMIN", authMethod: "api_key", isSuperuser: true },
  ])("rejects unauthorized principal %j", async auth => {
    const guard = new SuperuserGuard(denied as never);
    await expect(guard.canActivate(request(auth))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
  it("allows an authenticated human superuser", async () => {
    const guard = new SuperuserGuard(denied as never);
    await expect(
      guard.canActivate(request({ authMethod: "session", isSuperuser: true }))
    ).resolves.toBe(true);
  });
});
