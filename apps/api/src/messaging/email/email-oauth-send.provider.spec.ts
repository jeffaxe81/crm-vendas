import { jest } from "@jest/globals";
import {
  type EmailOAuthSendCredentials,
  EmailOAuthSendProvider,
} from "./email-oauth-send.provider";
import {
  EmailDeliveryUnknownError,
  EmailProviderUnavailableError,
} from "./email-provider";
import type { TransactionalEmail } from "./email-provider";

const email: TransactionalEmail = {
  organizationId: "tenant-a",
  referenceId: "ref",
  idempotencyKey: "key",
  purpose: "SLA_DUE_SOON",
  recipient: "test@example.com",
  subject: "Olá",
  text: "texto",
  html: "<p>texto</p>",
};
const policy = {
  enabled: true,
  homologationRecipients: new Map([["tenant-a", new Set([email.recipient])]]),
};
describe("OAuth sending homologation adapters", () => {
  it.each(["GMAIL", "MICROSOFT_365"] as const)(
    "submits %s once with pinned endpoint and no sender override",
    async provider => {
      const request = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(null, { status: provider === "GMAIL" ? 200 : 202 })
        );
      const credentials = {
        acquire: jest
          .fn<EmailOAuthSendCredentials["acquire"]>()
          .mockResolvedValue({
            provider,
            accessToken: "secret-token-abcdefghijkl",
          }),
      };
      const result = await new EmailOAuthSendProvider(
        credentials,
        policy,
        request
      ).send(email);
      expect(result.providerMessageId).toMatch(/^oauth-accepted:/);
      expect(request).toHaveBeenCalledTimes(1);
      const [url, options] = request.mock.calls[0]!;
      expect(url).toBe(
        provider === "GMAIL"
          ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
          : "https://graph.microsoft.com/v1.0/me/sendMail"
      );
      expect(options?.redirect).toBe("manual");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(options?.body as string);
      if (provider === "GMAIL") {
        const mime = Buffer.from(body.raw, "base64url").toString();
        expect(mime).toContain("To: test@example.com\r\n");
        expect(mime).not.toContain("From:");
      } else expect(body.message.from).toBeUndefined();
    }
  );
  it.each([false, true])(
    "rejects unauthorized tenant/recipient before credentials/network (enabled=%s)",
    async enabled => {
      const acquire = jest.fn<EmailOAuthSendCredentials["acquire"]>();
      const request = jest.fn<typeof fetch>();
      const adapter = new EmailOAuthSendProvider(
        { acquire },
        { ...policy, enabled },
        request
      );
      await expect(
        adapter.send({ ...email, organizationId: "tenant-b" })
      ).rejects.toBeInstanceOf(EmailProviderUnavailableError);
      await expect(
        adapter.send({ ...email, recipient: "other@example.com" })
      ).rejects.toBeInstanceOf(EmailProviderUnavailableError);
      expect(acquire).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it.each([400, 401, 429, 500, 302])(
    "quarantines HTTP %s without retry",
    async status => {
      const request = jest
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      const adapter = new EmailOAuthSendProvider(
        {
          acquire: async () => ({
            provider: "GMAIL",
            accessToken: "secret-token-abcdefghijkl",
          }),
        },
        policy,
        request
      );
      await expect(adapter.send(email)).rejects.toBeInstanceOf(
        EmailDeliveryUnknownError
      );
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it("quarantines timeout and rejects header injection before transport", async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("secret upstream failure"));
    const adapter = new EmailOAuthSendProvider(
      {
        acquire: async () => ({
          provider: "MICROSOFT_365",
          accessToken: "secret-token-abcdefghijkl",
        }),
      },
      policy,
      request
    );
    await expect(adapter.send(email)).rejects.toThrow(
      "Transactional email acceptance could not be confirmed"
    );
    await expect(
      adapter.send({ ...email, subject: "hello\r\nBcc: attacker@example.com" })
    ).rejects.toBeInstanceOf(EmailProviderUnavailableError);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
