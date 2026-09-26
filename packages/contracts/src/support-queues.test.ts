import { describe, expect, it } from "vitest";

import {
  SupportQueueCreateInputSchema,
  SupportQueueListQuerySchema,
  SupportQueueUpdateInputSchema,
} from "./support-queues";
import {
  TICKET_OPEN_STATUSES,
  TicketAssignToMeInputSchema,
  TicketCreateInputSchema,
  TicketListQuerySchema,
  TicketUpdateInputSchema,
} from "./tickets";

const uuid = "5f0c7c1e-4d8f-4b8e-9a1f-2f6b1a2c3d4e";

describe("C5.2 support queue contracts", () => {
  it("applies defaults, trims the name and rejects unknown fields", () => {
    expect(
      SupportQueueCreateInputSchema.parse({ name: " Suporte N1 " })
    ).toEqual({ name: "Suporte N1", isActive: true, autoAssign: false });
    expect(
      SupportQueueCreateInputSchema.safeParse({ name: "   " }).success
    ).toBe(false);
    expect(
      SupportQueueCreateInputSchema.safeParse({ name: "A", color: "red" })
        .success
    ).toBe(false);
  });

  it("requires version and at least one change on update", () => {
    expect(
      SupportQueueUpdateInputSchema.safeParse({ version: 1 }).success
    ).toBe(false);
    expect(
      SupportQueueUpdateInputSchema.safeParse({ autoAssign: true }).success
    ).toBe(false);
    expect(
      SupportQueueUpdateInputSchema.parse({ description: null, version: 2 })
    ).toEqual({ description: null, version: 2 });
  });

  it("parses the active filter", () => {
    expect(SupportQueueListQuerySchema.parse({}).active).toBeUndefined();
    expect(SupportQueueListQuerySchema.parse({ active: "true" }).active).toBe(
      true
    );
  });
});

describe("C5.2 ticket queue and assignment contracts", () => {
  it("accepts queueId on create and nullable queueId on update", () => {
    expect(
      TicketCreateInputSchema.parse({ subject: "X", queueId: uuid }).queueId
    ).toBe(uuid);
    expect(
      TicketUpdateInputSchema.parse({ queueId: null, version: 1 }).queueId
    ).toBeNull();
    expect(
      TicketCreateInputSchema.safeParse({ subject: "X", queueId: "fila" })
        .success
    ).toBe(false);
  });

  it("accepts assigneeUserId=me and queueId filters", () => {
    const parsed = TicketListQuerySchema.parse({
      assigneeUserId: "me",
      queueId: uuid,
    });
    expect(parsed).toMatchObject({ assigneeUserId: "me", queueId: uuid });
    expect(
      TicketListQuerySchema.safeParse({ assigneeUserId: "you" }).success
    ).toBe(false);
  });

  it("validates assign-to-me and lists open statuses", () => {
    expect(TicketAssignToMeInputSchema.parse({ version: 3 })).toEqual({
      version: 3,
    });
    expect(TicketAssignToMeInputSchema.safeParse({}).success).toBe(false);
    expect(TICKET_OPEN_STATUSES).toEqual([
      "OPEN",
      "IN_PROGRESS",
      "WAITING_CUSTOMER",
    ]);
  });
});
