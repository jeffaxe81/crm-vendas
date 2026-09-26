import type { SlaState, TicketSla } from "@axes/contracts";

export const slaStateLabels: Record<SlaState, string> = {
  OK: "No prazo",
  AT_RISK: "Em risco",
  BREACHED: "Vencido",
  MET: "Cumprido",
  MISSED: "Cumprido fora do prazo",
};

const SEVERITY: Record<SlaState, number> = {
  BREACHED: 4,
  AT_RISK: 3,
  MISSED: 2,
  OK: 1,
  MET: 0,
};

/** Estado mais grave entre primeira resposta e resolução (ou `null`). */
export function worstSlaState(sla: TicketSla | undefined): SlaState | null {
  const states = [sla?.firstResponse, sla?.resolution].filter(
    (state): state is SlaState => state !== null && state !== undefined
  );
  if (states.length === 0) {
    return null;
  }
  return states.reduce((worst, state) =>
    SEVERITY[state] > SEVERITY[worst] ? state : worst
  );
}

/** C5.3 — indicador visual de SLA; destaca "Em risco" e "Vencido". */
export function SlaBadge({ state }: { state: SlaState | null }) {
  if (state === null) {
    return <span className="sla-badge sla-badge--none">Sem SLA</span>;
  }
  return (
    <span className={`sla-badge sla-badge--${state.toLowerCase()}`}>
      {slaStateLabels[state]}
    </span>
  );
}

/** Minutos corridos em texto curto: "45 min", "4 h", "1 d 2 h". */
export function formatSlaMinutes(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [
    days ? `${days} d` : "",
    hours ? `${hours} h` : "",
    rest ? `${rest} min` : "",
  ].filter(Boolean);
  return parts.join(" ");
}
