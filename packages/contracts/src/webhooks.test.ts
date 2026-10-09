import { describe, expect, it } from "vitest";
import {
  WebhookSubscriptionCreateInputSchema,
  WebhookSubscriptionUpdateInputSchema,
} from "./index";
const create = {
  name: "ERP",
  targetUrl: "https://hooks.example.com/events",
  eventTypes: ["company.created"],
};

describe("webhook contracts", () => {
  it("accepts an explicit HTTPS destination and supported events", () => {
    expect(WebhookSubscriptionCreateInputSchema.safeParse(create).success).toBe(
      true
    );
  });
  it.each([
    "http://example.com",
    "https://u:p@example.com",
    "https://example.com:8443",
    "https://example.com/?token=secret",
    "https://example.com/#token",
  ])("rejects unsafe URL format %s", targetUrl => {
    expect(
      WebhookSubscriptionCreateInputSchema.safeParse({ ...create, targetUrl })
        .success
    ).toBe(false);
  });
  it("rejects tenant or secret injection", () => {
    expect(
      WebhookSubscriptionCreateInputSchema.safeParse({
        ...create,
        organizationId: "foreign",
      }).success
    ).toBe(false);
  });
  it.each(
    [[], ["company.created", "company.created"], ["contact.created"]].map(
      eventTypes => ({ eventTypes })
    )
  )("rejects empty, duplicate or unsupported events %j", ({ eventTypes }) => {
    expect(
      WebhookSubscriptionCreateInputSchema.safeParse({
        ...create,
        eventTypes,
      }).success
    ).toBe(false);
  });
  it("requires an optimistic version and a change for editing", () => {
    const schema = WebhookSubscriptionUpdateInputSchema;
    expect(schema.safeParse({ version: 1, isActive: false }).success).toBe(
      true
    );
    expect(schema.safeParse({ isActive: false }).success).toBe(false);
    expect(schema.safeParse({ version: 1 }).success).toBe(false);
    expect(
      schema.safeParse({ version: 1, plainSecret: "secret" }).success
    ).toBe(false);
  });
});
