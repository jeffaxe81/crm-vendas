export type WebhookDeliveryStatus =
  | "PENDING"
  | "RETRY_SCHEDULED"
  | "DELIVERED"
  | "EXHAUSTED";

export type WebhookDeliveryState = {
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
};

type DeliveryAttempt = {
  outcome: "DELIVERED" | "FAILED";
  now: Date;
  baseDelayMs: number;
};

export function nextWebhookDeliveryState(
  current: WebhookDeliveryState,
  attempt: DeliveryAttempt,
): WebhookDeliveryState {
  if (current.status === "DELIVERED") {
    throw new Error("Delivered webhooks cannot be reprocessed.");
  }

  const attemptCount = current.attemptCount + 1;

  if (attempt.outcome === "DELIVERED") {
    return {
      ...current,
      status: "DELIVERED",
      attemptCount,
      nextAttemptAt: null,
    };
  }

  if (attemptCount >= current.maxAttempts) {
    return {
      ...current,
      status: "EXHAUSTED",
      attemptCount,
      nextAttemptAt: null,
    };
  }

  const delayMs = attempt.baseDelayMs * 2 ** current.attemptCount;

  return {
    ...current,
    status: "RETRY_SCHEDULED",
    attemptCount,
    nextAttemptAt: new Date(attempt.now.getTime() + delayMs),
  };
}
