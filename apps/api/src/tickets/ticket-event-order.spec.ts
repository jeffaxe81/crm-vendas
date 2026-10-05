import { compareTicketEvents } from "./ticket-event-order";

describe("ticket event chronology", () => {
  const timestamp = new Date("2026-10-05T00:00:00.000Z");
  it("places creation before assignment with equal transaction timestamps", () => {
    const assigned = { id: "a", type: "ASSIGNED", createdAt: timestamp };
    const created = { id: "z", type: "CREATED", createdAt: timestamp };
    expect([assigned, created].sort(compareTicketEvents)).toEqual([
      created,
      assigned,
    ]);
  });
  it("preserves the database order when timestamps lose microsecond precision", () => {
    const early = { id: "z", type: "COMMENT", createdAt: timestamp };
    const later = new Date(timestamp.getTime() + 1);
    const a = { id: "a", type: "UPDATED", createdAt: later };
    const b = { id: "b", type: "COMMENT", createdAt: later };
    expect([b, a, early].sort(compareTicketEvents)).toEqual([early, b, a]);
  });
});
