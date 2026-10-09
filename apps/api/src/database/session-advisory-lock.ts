import { Client } from "pg";

type LockClient = Pick<Client, "connect" | "query" | "end" | "on">;

/** A dedicated session keeps its lock across commits without borrowing a Prisma pool slot. */
export async function runWithSessionAdvisoryLock<T>(
  connectionString: string,
  key: string,
  operation: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  sharedKey?: string,
  createClient: () => LockClient = () =>
    new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    })
): Promise<T> {
  const client = createClient();
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= client.end());
  const abort = () => {
    controller.abort();
    void close().catch(() => {});
  };
  client.on("error", abort);
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error("Connection gate aborted");
    await client.connect();
    if (controller.signal.aborted) throw new Error("Connection gate aborted");
    if (sharedKey)
      await client.query(
        "SELECT pg_advisory_lock_shared(hashtextextended($1,0))",
        [sharedKey]
      );
    await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
      key,
    ]);
    if (controller.signal.aborted) throw new Error("Connection gate aborted");
    return await operation(controller.signal);
  } finally {
    signal.removeEventListener("abort", abort);
    // Closing this exact dedicated session releases the lock, even after a failed query.
    await close();
  }
}
