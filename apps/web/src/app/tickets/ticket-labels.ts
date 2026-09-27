import type {
  TicketSla,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "@axes/contracts";

export const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em atendimento",
  WAITING_CUSTOMER: "Aguardando cliente",
  RESOLVED: "Resolvida",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

export const priorityLabels: Record<TicketPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const channelLabels: Record<TicketChannel, string> = {
  PHONE: "Telefone",
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  WEB: "Web",
  IN_PERSON: "Presencial",
  OTHER: "Outro",
};

export type TicketRecord = {
  id: string;
  protocol: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  channel: TicketChannel;
  companyId: string | null;
  contactId: string | null;
  assigneeUserId: string | null;
  queueId: string | null;
  openedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
  /** C5.3 — prazos e estado derivado do SLA. */
  firstResponseDueAt?: string | null;
  resolutionDueAt?: string | null;
  sla?: TicketSla;
};

export type TicketEventRecord = {
  id: string;
  type: "CREATED" | "COMMENT" | "STATUS_CHANGED" | "ASSIGNED" | "UPDATED";
  body: string | null;
  isInternal: boolean;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  metadata?: Record<string, unknown> | null;
  authorUserId: string;
  createdAt: string;
};

/** C5.2 — fila de atendimento como devolvida por `/support-queues`. */
export type SupportQueueRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  autoAssign: boolean;
  version: number;
  openTicketCount: number;
};

export const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
