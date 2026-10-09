import { summarizePipelineHealth } from "./pipeline-health";

const report = (counts: number[]) =>
  ({
    asOf: "2026-10-09T00:00:00.000Z",
    pipeline: { id: "pipeline-1", name: "Comercial", isActive: true },
    stages: counts.map((opportunities, index) => ({
      stageId: `stage-${index}`,
      name: `Etapa ${index}`,
      kind: "OPEN",
      opportunities,
    })),
    indicators: {
      openOpportunities: counts.reduce((sum, count) => sum + count, 0),
      openValue: "1500.00",
      winRate: null,
    },
  }) as Parameters<typeof summarizePipelineHealth>[0];

describe("Ciclo 6 pipeline health baseline", () => {
  it("flags concentration only when it exceeds 50 percent", () => {
    const result = summarizePipelineHealth(report([7, 3]));
    expect(result.stageConcentration).toEqual({
      stageId: "stage-0",
      stageName: "Etapa 0",
      percentage: 70,
      threshold: 50,
      exceeded: true,
    });
    expect(result.totalOpenOpportunities).toBe(10);
    expect(result.openValue).toBe("1500.00");
  });

  it("keeps exactly 50 percent below the alert threshold", () => {
    expect(
      summarizePipelineHealth(report([5, 5])).stageConcentration.exceeded
    ).toBe(false);
  });

  it("handles pipelines without open opportunities", () => {
    const result = summarizePipelineHealth(report([]));
    expect(result.stageConcentration).toEqual({
      stageId: null,
      stageName: null,
      percentage: 0,
      threshold: 50,
      exceeded: false,
    });
    expect(result.stages).toEqual([]);
  });
});
