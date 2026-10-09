/** Opportunity age is measured from creation, not stage entry. */
export function opportunityAgeDays(createdAt: Date, asOf: Date): number {
  const elapsedMs = asOf.getTime() - createdAt.getTime();
  return Math.max(0, Math.round((elapsedMs / 86400000) * 100) / 100);
}

export function summarizeOpportunityAges(
  opportunities: readonly { createdAt: Date; stageId: string }[],
  asOf: Date
) {
  const totals = new Map<string, { count: number; sum: number; oldest: number }>();
  for (const opportunity of opportunities) {
    const days = opportunityAgeDays(opportunity.createdAt, asOf);
    const current = totals.get(opportunity.stageId) ?? { count: 0, sum: 0, oldest: 0 };
    current.count += 1;
    current.sum += days;
    current.oldest = Math.max(current.oldest, days);
    totals.set(opportunity.stageId, current);
  }
  return [...totals.entries()].map(([stageId, aggregate]) => ({
    stageId,
    opportunities: aggregate.count,
    averageDays: Math.round((aggregate.sum / aggregate.count) * 100) / 100,
    oldestDays: aggregate.oldest,
  }));
}
