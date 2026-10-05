type ChronologicalEvent = { id: string; type: string; createdAt: Date };

export function compareTicketEvents(
  left: ChronologicalEvent,
  right: ChronologicalEvent
): number {
  const time = left.createdAt.getTime() - right.createdAt.getTime();
  if (time !== 0) return time;
  // PostgreSQL now() is shared by events written in the same transaction.
  // UUID order must never place assignment before the ticket's creation.
  const creation =
    Number(right.type === "CREATED") - Number(left.type === "CREATED");
  if (creation !== 0) return creation;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
