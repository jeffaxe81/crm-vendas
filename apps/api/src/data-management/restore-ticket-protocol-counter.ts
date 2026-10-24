import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import type { SnapshotData } from "./backup-manifest";

type ProtocolCounterHighWater = {
  year: number;
  lastValue: number;
};

const POSTGRES_INT_MIN = -2_147_483_648;
const POSTGRES_INT_MAX = 2_147_483_647;

function fail(): never {
  throw new BackupError("RESTORE_TARGET_INVALID");
}

/**
 * Validate the special MERGE_HIGH_WATER snapshot before any destructive
 * replacement starts. Missing counter data is treated as an empty legacy
 * projection, which safely preserves all live high-water rows.
 */
export function prepareTicketProtocolCounterHighWater(
  data: SnapshotData,
  organizationId: string
): ProtocolCounterHighWater[] {
  const source = data.TicketProtocolCounter;
  if (source === undefined) return [];
  if (!Array.isArray(source)) fail();

  const years = new Set<number>();
  return source.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return fail();

    const year = row.year;
    const lastValue = row.lastValue;
    if (
      Object.keys(row).length !== 3 ||
      row.organizationId !== organizationId ||
      typeof year !== "number" ||
      !Number.isSafeInteger(year) ||
      year < POSTGRES_INT_MIN ||
      year > POSTGRES_INT_MAX ||
      typeof lastValue !== "number" ||
      !Number.isSafeInteger(lastValue) ||
      lastValue < 0 ||
      lastValue > POSTGRES_INT_MAX
    ) {
      return fail();
    }

    if (years.has(year)) fail();
    years.add(year);
    return { year, lastValue };
  });
}

/**
 * Keep protocol allocation monotonic. Rows existing only in the live tenant
 * are intentionally preserved; snapshot rows are inserted when absent and
 * can only raise, never lower, an existing high-water value.
 */
export async function applyTicketProtocolCounterHighWater(
  tx: Prisma.TransactionClient,
  organizationId: string,
  counters: readonly ProtocolCounterHighWater[]
): Promise<void> {
  for (const counter of counters) {
    const changed = await tx.$executeRaw`
      INSERT INTO ticket_protocol_counters (organization_id, year, last_value)
      VALUES (${organizationId}::uuid, ${counter.year}, ${counter.lastValue})
      ON CONFLICT (organization_id, year)
      DO UPDATE SET last_value = GREATEST(
        ticket_protocol_counters.last_value,
        EXCLUDED.last_value
      )
    `;
    if (changed !== 1) fail();
  }
}
