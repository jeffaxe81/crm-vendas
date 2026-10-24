import type { SnapshotData } from "./backup-manifest";
import { prepareTicketProtocolCounterHighWater } from "./restore-ticket-protocol-counter";

const organizationId = "00000000-0000-0000-0000-000000000001";

describe("protocol counter snapshot validation before restore", () => {
  it.each([1, 2_147_483_647])("accepts positive counter %s", lastValue => {
    expect(
      prepareTicketProtocolCounterHighWater(
        { TicketProtocolCounter: [{ organizationId, year: 2026, lastValue }] },
        organizationId
      )
    ).toEqual([{ year: 2026, lastValue }]);
  });

  it.each([0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects counter %s before database writes",
    lastValue => {
      expect(() =>
        prepareTicketProtocolCounterHighWater(
          {
            TicketProtocolCounter: [{ organizationId, year: 2026, lastValue }],
          },
          organizationId
        )
      ).toThrow("RESTORE_TARGET_INVALID");
    }
  );

  it("preserves live counters when a legacy snapshot omits the collection", () => {
    expect(prepareTicketProtocolCounterHighWater({}, organizationId)).toEqual(
      []
    );
  });

  it("rejects another tenant's counter", () => {
    expect(() =>
      prepareTicketProtocolCounterHighWater(
        {
          TicketProtocolCounter: [
            {
              organizationId: "00000000-0000-0000-0000-000000000002",
              year: 2026,
              lastValue: 10,
            },
          ],
        },
        organizationId
      )
    ).toThrow("RESTORE_TARGET_INVALID");
  });

  it("rejects duplicate years instead of selecting an ambiguous counter", () => {
    expect(() =>
      prepareTicketProtocolCounterHighWater(
        {
          TicketProtocolCounter: [
            { organizationId, year: 2026, lastValue: 10 },
            { organizationId, year: 2026, lastValue: 29 },
          ],
        },
        organizationId
      )
    ).toThrow("RESTORE_TARGET_INVALID");
  });

  it.each([null, {}, [null], [{ organizationId, year: 2026 }]])(
    "rejects malformed counter collections (%j)",
    collection => {
      expect(() =>
        prepareTicketProtocolCounterHighWater(
          { TicketProtocolCounter: collection } as unknown as SnapshotData,
          organizationId
        )
      ).toThrow("RESTORE_TARGET_INVALID");
    }
  );
});
