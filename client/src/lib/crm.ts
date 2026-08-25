export const PIPELINE_STAGES = [
  { id: "prospecting", label: "Prospecção", tone: "slate" },
  { id: "qualification", label: "Qualificação", tone: "blue" },
  { id: "proposal", label: "Proposta", tone: "violet" },
  { id: "negotiation", label: "Negociação", tone: "amber" },
  { id: "won", label: "Ganha", tone: "emerald" },
  { id: "lost", label: "Perdida", tone: "rose" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["id"];

export const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
} as const;

export const INTERACTION_LABELS = {
  call: "Ligação",
  meeting: "Reunião",
  email: "E-mail",
  message: "Mensagem",
  note: "Anotação",
} as const;

export function stageMeta(stage: string) {
  return PIPELINE_STAGES.find(item => item.id === stage) ?? PIPELINE_STAGES[0];
}

export function formatCurrency(value: string | number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function initials(name?: string | null) {
  return (name ?? "CRM").split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
