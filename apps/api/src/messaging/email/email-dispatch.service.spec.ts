import { EmailDispatchService } from "./email-dispatch.service";
import {
  DisabledEmailProvider,
  type EmailProvider,
  type TransactionalEmail,
} from "./email-provider";

const message: TransactionalEmail = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  referenceId: "00000000-0000-4000-8000-000000000002",
  idempotencyKey: "sla:org:ticket:due",
  purpose: "SLA_DUE_SOON",
  recipient: "client@example.com",
  subject: "Alerta de SLA",
  text: "Sua solicitação está próxima do vencimento.",
  html: "<p>SLA próximo.</p>",
};

describe("F4.3 provider isolation", () => {
  it("fails closed when no provider is configured", async () => {
    const mail = new EmailDispatchService(new DisabledEmailProvider());
    await expect(mail.attempt(message)).resolves.toEqual({
      status: "FAILED",
      errorCode: "PROVIDER_NOT_CONFIGURED",
    });
  });

  it("returns acceptance, not a false delivery confirmation", async () => {
    let captured: TransactionalEmail | undefined;
    const provider: EmailProvider = {
      send: async email => {
        captured = email;
        return { providerMessageId: "remote-100" };
      },
    };
    const mail = new EmailDispatchService(provider);
    await expect(mail.attempt(message)).resolves.toEqual({
      status: "ACCEPTED",
      providerMessageId: "remote-100",
    });
    expect(captured).toEqual(message);
  });

  it("turns provider exceptions into safe failures without leaking secrets", async () => {
    const provider: EmailProvider = {
      send: async () => {
        throw Error("provider secret token 12345");
      },
    };
    const mail = new EmailDispatchService(provider);
    const outcome = await mail.attempt(message);
    expect(outcome).toEqual({
      status: "FAILED",
      errorCode: "PROVIDER_ERROR",
    });
    expect(JSON.stringify(outcome)).not.toContain("token 12345");
  });

  it("does not treat an empty provider message id as accepted", async () => {
    const provider: EmailProvider = {
      send: async () => ({ providerMessageId: "" }),
    };
    const mail = new EmailDispatchService(provider);
    await expect(mail.attempt(message)).resolves.toEqual({
      status: "FAILED",
      errorCode: "PROVIDER_ERROR",
    });
  });

  it("returns failure without throwing into the caller's business flow", async () => {
    const provider: EmailProvider = {
      send: async () => {
        throw Error("upstream unavailable");
      },
    };
    const mail = new EmailDispatchService(provider);
    let ticketCompleted = false;
    const businessFlow = async () => {
      ticketCompleted = true;
      const result = await mail.attempt(message);
      return result;
    };
    const outcome = await businessFlow();
    expect(ticketCompleted).toBe(true);
    expect(outcome.status).toBe("FAILED");
  });
});
