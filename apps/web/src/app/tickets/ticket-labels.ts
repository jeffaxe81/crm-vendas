import type {
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
  openedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
};

export type TicketEventRecord = {
  id: string;
  type: "CREATED" | "COMMENT" | "STATUS_CHANGED" | "ASSIGNED" | "UPDATED";
  body: string | null;
  isInternal: boolean;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  authorUserId: string;
  createdAt: string;
};

export const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
