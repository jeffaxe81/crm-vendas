import { DashboardVolumeSchema, type DashboardVolume } from "@axes/contracts";

export const DASHBOARD_COUNT_KEYS = [
  "companies",
  "contacts",
  "opportunities",
  "activities",
] as const;

export type DashboardComparison = {
  totalDelta: number;
  elapsedSeconds: number;
  delta: Record<(typeof DASHBOARD_COUNT_KEYS)[number], number>;
};

export function compareDashboardVolumes(
  before: DashboardVolume,
  after: DashboardVolume
): DashboardComparison | null {
  const old = DashboardVolumeSchema.parse(before);
  const current = DashboardVolumeSchema.parse(after);
  const elapsedSeconds =
    (Date.parse(current.asOf) - Date.parse(old.asOf)) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null;
  // This compares two observed snapshots, not a persisted historical series.
  return {
    elapsedSeconds,
    totalDelta: current.totalActiveRecords - old.totalActiveRecords,
    delta: {
      companies: current.counts.companies - old.counts.companies,
      contacts: current.counts.contacts - old.counts.contacts,
      opportunities: current.counts.opportunities - old.counts.opportunities,
      activities: current.counts.activities - old.counts.activities,
    },
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Guard spreadsheet formula injection, even if a future metric gains labels.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Contains aggregates only; no tenant IDs, tokens, or individual records. */
export function dashboardVolumeCsv(snapshot: DashboardVolume): string {
  const parsed = DashboardVolumeSchema.parse(snapshot);
  const rows: Array<[string, string | number]> = [
    ["Indicador", "Quantidade"],
    ["Empresas ativas", parsed.counts.companies],
    ["Contatos ativos", parsed.counts.contacts],
    ["Oportunidades ativas", parsed.counts.opportunities],
    ["Atividades ativas", parsed.counts.activities],
    ["Total de registros ativos", parsed.totalActiveRecords],
    ["Atualizado em (UTC)", parsed.asOf],
  ];
  return (
    "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n") + "\r\n"
  );
}

export function downloadDashboardVolumeCsv(snapshot: DashboardVolume): void {
  const csv = dashboardVolumeCsv(snapshot);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dashboard-volume.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
