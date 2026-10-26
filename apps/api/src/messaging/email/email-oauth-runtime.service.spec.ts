import { EmailOAuthRuntimeService } from "./email-oauth-runtime.service";
import type { PrismaService } from "../../database/prisma.service";
const context = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "00000000-0000-4000-8000-000000000002",
  sessionId: "00000000-0000-4000-8000-000000000003",
  authMethod: "session" as const,
  requestId: "test-status",
};
it("reports pending client setup for127.0.0.1 without requesting a domain or reading credentials", async () => {
  const runtime = new EmailOAuthRuntimeService({} as PrismaService, {
    EMAIL_OAUTH_CALLBACK_ORIGIN: "http://127.0.0.1:3000",
  });
  await expect(runtime.status("GMAIL", context)).resolves.toEqual({
    provider: "GMAIL",
    connectionStatus: "PENDING_CLIENT_CONFIG",
    sendingEnabled: false,
  });
  await expect(
    runtime.status("GMAIL", { ...context, authMethod: "api_key" })
  ).rejects.toMatchObject({ status: 403 });
});
