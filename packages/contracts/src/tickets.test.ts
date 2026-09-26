import { describe, expect, it } from "vitest";

import {
  TicketCreateInputSchema,
  TicketStatusSchema,
  TicketUpdateInputSchema,
  canTransitionTicket,
  formatTicketProtocol,
} from "./tickets";

describe("C5.1 ticket contracts", () => {
  it("formats protocols with year and zero-padded sequence", () => {
    expect(formatTicketProtocol(2026, 1)).toBe("2026-000001");
    expect(formatTicketProtocol(2026, 1234567)).toBe("2026-1234567");
  });

  it("allows only the documented transitions", () => {
    expect(canTransitionTicket("OPEN", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTicket("RESOLVED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTicket("RESOLVED", "CLOSED")).toBe(true);
    expect(canTransitionTicket("OPEN", "CLOSED")).toBe(false);
    for (const to of TicketStatusSchema.options) {
      expect(canTransitionTicket("CLOSED", to)).toBe(false);
      expect(canTransitionTicket("CANCELLED", to)).toBe(false);
    }
  });

  it("applies defaults and rejects unknown fields", () => {
    const parsed = TicketCreateInputSchema.parse({ subject: " Sem sinal " });
    expect(parsed).toMatchObject({
      subject: "Sem sinal",
      priority: "MEDIUM",
      channel: "OTHER",
    });
    expect(
      TicketCreateInputSchema.safeParse({ subject: "x", status: "CLOSED" })
        .success
    ).toBe(false);
  });

  it("requires a change besides version on update", () => {
    expect(TicketUpdateInputSchema.safeParse({ version: 1 }).success).toBe(
      false
    );
    expect(
      TicketUpdateInputSchema.safeParse({ priority: "URGENT", version: 1 })
        .success
    ).toBe(true);
  });
});
