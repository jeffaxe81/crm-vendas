import { composeSatisfactionEmail, composeSlaDueEmail } from "./email-composer";

const shared = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  ticketId: "00000000-0000-4000-8000-000000000002",
  recipient: "client@example.com",
  protocol: "CRM-2026-123",
};

describe("F4.3 email composition", () => {
  it("renders a stable SLA notification", () => {
    const dueAt = new Date("2026-10-11T10:00:00.000Z");
    const message = composeSlaDueEmail({
      ...shared,
      dueAt,
      minutesRemaining: 30,
    });
    expect(message).toMatchObject({
      purpose: "SLA_DUE_SOON",
      organizationId: shared.organizationId,
      referenceId: shared.ticketId,
      recipient: shared.recipient,
      idempotencyKey: [
        "sla",
        shared.organizationId,
        shared.ticketId,
        dueAt.toISOString(),
      ].join(":"),
    });
    expect(message.subject).toContain(shared.protocol);
    expect(message.text).toContain("30 minutos");
    expect(message.html).toContain("<strong>CRM-2026-123</strong>");
    expect(
      composeSlaDueEmail({ ...shared, dueAt, minutesRemaining: 30 })
        .idempotencyKey
    ).toBe(message.idempotencyKey);
  });

  it("escapes HTML and prevents email header injection", () => {
    const message = composeSlaDueEmail({
      ...shared,
      protocol: "CRM-1<script>alert(1)</script>",
      dueAt: new Date("2026-10-11T10:00:00Z"),
      minutesRemaining: 12,
    });
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
    expect(() =>
      composeSlaDueEmail({
        ...shared,
        recipient: "client@example.com\r\nBcc:evil@example.com",
        dueAt: new Date(),
        minutesRemaining: 15,
      })
    ).toThrow();
    expect(() =>
      composeSlaDueEmail({
        ...shared,
        protocol: "ABC\nInjected",
        dueAt: new Date(),
        minutesRemaining: 15,
      })
    ).toThrow();
  });

  it.each([-1, 3.5, 10081, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid SLA minutes %s",
    minutesRemaining => {
      expect(() =>
        composeSlaDueEmail({
          ...shared,
          dueAt: new Date("2026-10-11T10:00:00Z"),
          minutesRemaining,
        })
      ).toThrow("INVALID_SLA_EMAIL_INPUT");
    }
  );

  it("rejects invalid SLA dates and recipient mailboxes", () => {
    expect(() =>
      composeSlaDueEmail({
        ...shared,
        dueAt: new Date("invalid"),
        minutesRemaining: 10,
      })
    ).toThrow("INVALID_SLA_EMAIL_INPUT");
    expect(() =>
      composeSlaDueEmail({
        ...shared,
        recipient: "Client <client@example.com>",
        dueAt: new Date(),
        minutesRemaining: 10,
      })
    ).toThrow("INVALID_EMAIL_RECIPIENT");
  });

  it("creates a versioned satisfaction email", () => {
    const message = composeSatisfactionEmail({
      ...shared,
      surveyId: "00000000-0000-4000-8000-000000000003",
      surveyVersion: 2,
      surveyUrl: "https://crm.example.com/avaliacao/valid-token",
    });
    expect(message).toMatchObject({
      purpose: "SATISFACTION_REQUEST",
      idempotencyKey: [
        "satisfaction",
        shared.organizationId,
        "00000000-0000-4000-8000-000000000003",
        2,
      ].join(":"),
    });
    expect(message.text).toContain(
      "https://crm.example.com/avaliacao/valid-token"
    );
    expect(message.html).toContain(
      'href="https://crm.example.com/avaliacao/valid-token"'
    );
  });

  it.each([
    "javascript:alert(1)",
    "http://crm.example.com/avaliacao/token",
    "https://user:password@crm.example.com/avaliacao/token",
    "https://crm.example.com/avaliacao/token#fragment",
    "https://crm.example.com/avaliacao/token?redirect=https://evil.example",
    "https://crm.example.com/other-route",
  ])("rejects unsafe survey URL %s", surveyUrl => {
    expect(() =>
      composeSatisfactionEmail({
        ...shared,
        surveyId: "survey",
        surveyVersion: 1,
        surveyUrl,
      })
    ).toThrow("INVALID_SURVEY_URL");
  });

  it("rejects a nonpositive or noninteger survey version", () => {
    expect(() =>
      composeSatisfactionEmail({
        ...shared,
        surveyId: "survey",
        surveyVersion: 0,
        surveyUrl: "https://crm.example.com/avaliacao/token",
      })
    ).toThrow("INVALID_SURVEY_VERSION");
  });
});
