import { describe, expect, it } from "vitest";

import {
  CsatReportQuerySchema,
  CsatReportSchema,
  TICKET_SATISFACTION_COMMENT_MAX,
  TicketSatisfactionLinkInputSchema,
  TicketSatisfactionResponseInputSchema,
  TicketSatisfactionSurveySchema,
  TicketSatisfactionTokenSchema,
  summarizeCsat,
} from "./ticket-satisfaction";

describe("C5.4 ticket satisfaction contracts", () => {
  it("accepts ratings from 1 to 5 and trims optional comments", () => {
    expect(
      TicketSatisfactionResponseInputSchema.parse({
        rating: 5,
        comment: "  Ótimo atendimento ",
      })
    ).toEqual({ rating: 5, comment: "Ótimo atendimento" });
    expect(
      TicketSatisfactionResponseInputSchema.parse({ rating: 1, comment: "  " })
    ).toEqual({ rating: 1 });
    for (const rating of [0, 6, 3.5, "4"]) {
      expect(
        TicketSatisfactionResponseInputSchema.safeParse({ rating }).success
      ).toBe(false);
    }
  });

  it("limits the comment size and rejects unknown fields", () => {
    expect(
      TicketSatisfactionResponseInputSchema.safeParse({
        rating: 4,
        comment: "x".repeat(TICKET_SATISFACTION_COMMENT_MAX + 1),
      }).success
    ).toBe(false);
    expect(
      TicketSatisfactionResponseInputSchema.safeParse({
        rating: 4,
        organizationId: "00000000-0000-4000-8000-000000000000",
      }).success
    ).toBe(false);
    expect(TicketSatisfactionLinkInputSchema.safeParse({}).success).toBe(true);
    expect(
      TicketSatisfactionLinkInputSchema.safeParse({ version: 0 }).success
    ).toBe(false);
  });

  it("accepts only 43-char base64url tokens", () => {
    expect(
      TicketSatisfactionTokenSchema.safeParse("a".repeat(43)).success
    ).toBe(true);
    expect(
      TicketSatisfactionTokenSchema.safeParse("a".repeat(42)).success
    ).toBe(false);
    expect(
      TicketSatisfactionTokenSchema.safeParse(`${"a".repeat(42)}/`).success
    ).toBe(false);
  });

  it("never exposes token fields in the team survey payload", () => {
    const parsed = TicketSatisfactionSurveySchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      ticketId: "00000000-0000-4000-8000-000000000002",
      state: "PENDING",
      expiresAt: "2026-10-03T12:00:00.000Z",
      rating: null,
      comment: null,
      respondedAt: null,
      createdAt: "2026-09-26T12:00:00.000Z",
      version: 1,
      tokenHash: "abc",
    });
    expect(parsed).not.toHaveProperty("tokenHash");
  });

  it("validates the report period", () => {
    expect(
      CsatReportQuerySchema.safeParse({
        from: "2026-09-30T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }).success
    ).toBe(false);
    expect(CsatReportQuerySchema.safeParse({ type: "x" }).success).toBe(false);
  });

  it("summarizes response rate, average and CSAT%", () => {
    const summary = summarizeCsat(8, {
      "1": 1,
      "2": 0,
      "3": 1,
      "4": 1,
      "5": 2,
    });
    expect(summary).toEqual({
      responded: 5,
      responseRate: 5 / 8,
      averageRating: (1 + 3 + 4 + 10) / 5,
      csat: 3 / 5,
    });
    expect(
      summarizeCsat(0, { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 })
    ).toEqual({
      responded: 0,
      responseRate: null,
      averageRating: null,
      csat: null,
    });
    expect(
      CsatReportSchema.safeParse({
        asOf: "2026-09-26T12:00:00.000Z",
        filters: { from: null, to: null },
        sent: 8,
        distribution: { "1": 1, "2": 0, "3": 1, "4": 1, "5": 2 },
        ...summary,
      }).success
    ).toBe(true);
  });
});
