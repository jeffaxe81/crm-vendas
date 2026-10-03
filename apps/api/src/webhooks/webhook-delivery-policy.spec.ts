import {
  nextWebhookDeliveryState,
  type WebhookDeliveryState,
} from "./webhook-delivery-policy";

describe("F4.2 webhook delivery retry policy", () => {
  const now = new Date("2026-09-27T15:00:00.000Z");

  it("schedules an exponential retry after a failed attempt", () => {
    const current: WebhookDeliveryState = {
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: 4,
      nextAttemptAt: now,
    };

    expect(
      nextWebhookDeliveryState(current, {
        outcome: "FAILED",
        now,
        baseDelayMs: 30_000,
      })
    ).toEqual({
      status: "RETRY_SCHEDULED",
      attemptCount: 1,
      maxAttempts: 4,
      nextAttemptAt: new Date("2026-09-27T15:00:30.000Z"),
    });

    const second: WebhookDeliveryState = {
      status: "RETRY_SCHEDULED",
      attemptCount: 1,
      maxAttempts: 4,
      nextAttemptAt: new Date("2026-09-27T15:00:30.000Z"),
    };

    expect(
      nextWebhookDeliveryState(second, {
        outcome: "FAILED",
        now,
        baseDelayMs: 30_000,
      }).nextAttemptAt
    ).toEqual(new Date("2026-09-27T15:01:00.000Z"));
  });

  it("marks delivery exhausted when the maximum attempt count is reached", () => {
    const current: WebhookDeliveryState = {
      status: "RETRY_SCHEDULED",
      attemptCount: 3,
      maxAttempts: 4,
      nextAttemptAt: now,
    };

    expect(
      nextWebhookDeliveryState(current, {
        outcome: "FAILED",
        now,
        baseDelayMs: 30_000,
      })
    ).toEqual({
      status: "EXHAUSTED",
      attemptCount: 4,
      maxAttempts: 4,
      nextAttemptAt: null,
    });
  });

  it("marks a successful delivery as delivered and removes retry scheduling", () => {
    const current: WebhookDeliveryState = {
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: 4,
      nextAttemptAt: now,
    };

    expect(
      nextWebhookDeliveryState(current, {
        outcome: "DELIVERED",
        now,
        baseDelayMs: 30_000,
      })
    ).toEqual({
      status: "DELIVERED",
      attemptCount: 1,
      maxAttempts: 4,
      nextAttemptAt: null,
    });
  });

  it("rejects any attempt to reprocess an already delivered delivery", () => {
    const current: WebhookDeliveryState = {
      status: "DELIVERED",
      attemptCount: 1,
      maxAttempts: 4,
      nextAttemptAt: null,
    };

    expect(() =>
      nextWebhookDeliveryState(current, {
        outcome: "FAILED",
        now,
        baseDelayMs: 30_000,
      })
    ).toThrow("Delivered webhooks cannot be reprocessed.");
  });
});
