import { EventEmitter } from "node:events";
import type { Client } from "pg";
import { runWithSessionAdvisoryLock } from "./session-advisory-lock";

function fixture() {
  const queries: { sql: string; parameters: unknown[] }[] = [];
  let closes = 0;
  const client = Object.assign(new EventEmitter(), {
    connect: async () => {},
    query: async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
    },
    end: async () => {
      closes++;
    },
  });
  return {
    client,
    queries,
    get closes() {
      return closes;
    },
    run: (
      operation: (signal: AbortSignal) => Promise<unknown>,
      signal = new AbortController().signal
    ) =>
      runWithSessionAdvisoryLock(
        "postgresql://restricted@example/db",
        "gate",
        operation,
        signal,
        "maintenance",
        () => client as unknown as Client
      ),
  };
}
describe("dedicated session advisory lock lifecycle", () => {
  it("acquires maintenance before gate and closes the same dedicated session on success", async () => {
    const f = fixture();
    expect(await f.run(async () => "opened")).toBe("opened");
    expect(f.queries).toEqual([
      {
        sql: "SELECT pg_advisory_lock_shared(hashtextextended($1,0))",
        parameters: ["maintenance"],
      },
      {
        sql: "SELECT pg_advisory_lock(hashtextextended($1,0))",
        parameters: ["gate"],
      },
    ]);
    expect(f.closes).toBe(1);
  });
  it.each(["query", "operation"])(
    "closes its session after %s failure",
    async phase => {
      const f = fixture();
      if (phase === "query")
        f.client.query = async () => {
          throw Error("database failure");
        };
      await expect(
        f.run(async () => {
          throw Error("operation failure");
        })
      ).rejects.toThrow();
      expect(f.closes).toBe(1);
    }
  );
  it("closes and aborts a held gate on deadline even while the operation is blocked", async () => {
    const f = fixture(),
      controller = new AbortController();
    let held!: () => void, release!: () => void;
    const acquired = new Promise<void>(r => (held = r)),
      blocked = new Promise<void>(r => (release = r));
    const work = f.run(async signal => {
      held();
      await blocked;
      return !signal.aborted;
    }, controller.signal);
    await acquired;
    controller.abort();
    expect(f.closes).toBe(1);
    release();
    expect(await work).toBe(false);
    expect(f.closes).toBe(1);
  });
  it("invalidates the held gate and releases it on session connection loss", async () => {
    const f = fixture();
    expect(
      await f.run(async signal => {
        f.client.emit("error", Error("connection lost"));
        return !signal.aborted;
      })
    ).toBe(false);
    expect(f.closes).toBe(1);
  });
});
