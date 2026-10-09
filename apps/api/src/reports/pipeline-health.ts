import type { FunnelReport } from "@axes/contracts";

type PipelineHealthInput = Pick<
  FunnelReport,
  "asOf" | "pipeline" | "stages" | "indicators"
>;

/**
 * C6.1: deterministic baseline from the existing tenant-scoped funnel report.
 * This is a descriptive indicator, not an ML risk prediction or persisted alert.
 */
export function summarizePipelineHealth(report: PipelineHealthInput) {
  const open = report.stages
    .filter(stage => stage.kind === "OPEN")
    .map(stage => ({
      stageId: stage.stageId,
      name: stage.name,
      opportunities: stage.opportunities,
    }));
  const totalOpen = report.indicators.openOpportunities;
  const stages = open.map(stage => ({
    ...stage,
    percentage:
      totalOpen === 0
        ? 0
        : Math.round((stage.opportunities / totalOpen) * 10000) / 100,
  }));
  const largest = stages.reduce<(typeof stages)[number] | null>(
    (current, stage) =>
      current === null || stage.opportunities > current.opportunities
        ? stage
        : current,
    null
  );
  return {
    asOf: report.asOf,
    pipeline: report.pipeline,
    totalOpenOpportunities: totalOpen,
    openValue: report.indicators.openValue,
    winRate: report.indicators.winRate,
    stageConcentration: {
      stageId: largest?.stageId ?? null,
      stageName: largest?.name ?? null,
      percentage: largest?.percentage ?? 0,
      threshold: 50,
      exceeded: largest !== null && largest.percentage > 50,
    },
    stages,
    methodology: "deterministic-funnel-baseline-v1",
  };
}
