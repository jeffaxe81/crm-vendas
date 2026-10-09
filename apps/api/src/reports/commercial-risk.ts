export type RiskCandidate = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date | null;
};

export function evaluateCommercialRisk(
  candidate: RiskCandidate,
  asOf: Date,
  inactivityDays = 7
) {
  const elapsed = (date: Date) =>
    Math.max(0, (asOf.getTime() - date.getTime()) / 86400000);
  const lastContact = candidate.lastActivityAt ?? candidate.createdAt;
  const daysWithoutActivity = Math.floor(elapsed(lastContact));
  const daysWithoutUpdate = Math.floor(elapsed(candidate.updatedAt));
  const signals = [
    ...(daysWithoutActivity > inactivityDays
      ? ["NO_ACTIVITY"]
      : []),
    ...(daysWithoutUpdate > inactivityDays
      ? ["STALE_OPPORTUNITY"]
      : []),
  ];
  return {
    opportunityId: candidate.id,
    title: candidate.title,
    daysWithoutActivity,
    daysWithoutUpdate,
    signals,
    severity: signals.length === 2 ? "HIGH" : signals.length === 1 ? "MEDIUM" : "NONE",
  };
}
