import { z } from "zod";

import { TicketPrioritySchema, type TicketStatus } from "./tickets";

/** Limite de uma política: 1 ano em minutos corridos. */
export const SLA_MAX_MINUTES = 525_600;

/** Fração restante do prazo abaixo da qual o SLA fica "em risco". */
export const SLA_AT_RISK_FRACTION = 0.2;

const SlaMinutesSchema = z.number().int().positive().max(SLA_MAX_MINUTES);

export const SlaPolicyUpsertInputSchema = z
  .object({
    firstResponseMinutes: SlaMinutesSchema,
    resolutionMinutes: SlaMinutesSchema,
    isActive: z.boolean().default(true),
    /** Obrigatório ao editar uma política existente; ausente ao criar. */
    version: z.number().int().min(1).optional(),
  })
  .strict()
  .refine(value => value.resolutionMinutes >= value.firstResponseMinutes, {
    message:
      "O prazo de resolução deve ser maior ou igual ao de primeira resposta.",
    path: ["resolutionMinutes"],
  });

export const SlaPolicySchema = z.object({
  id: z.string().uuid(),
  priority: TicketPrioritySchema,
  firstResponseMinutes: SlaMinutesSchema,
  resolutionMinutes: SlaMinutesSchema,
  isActive: z.boolean(),
  version: z.number().int().min(1),
  updatedAt: z.string().datetime(),
});

export const SlaPolicyListSchema = z.object({
  items: z.array(SlaPolicySchema),
});

export const SlaStateSchema = z.enum([
  "OK",
  "AT_RISK",
  "BREACHED",
  "MET",
  "MISSED",
]);

/** Estado derivado do SLA de uma solicitação; `null` = sem prazo. */
export const TicketSlaSchema = z.object({
  firstResponse: SlaStateSchema.nullable(),
  resolution: SlaStateSchema.nullable(),
});

export type SlaPolicyUpsertInput = z.infer<typeof SlaPolicyUpsertInputSchema>;
export type SlaPolicy = z.infer<typeof SlaPolicySchema>;
export type SlaState = z.infer<typeof SlaStateSchema>;
export type TicketSla = z.infer<typeof TicketSlaSchema>;

type DateLike = Date | string;

const toMs = (value: DateLike) =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

/**
 * Estado de um prazo (minutos corridos, 24x7):
 * - cumprido até o prazo (inclusive o instante exato) → `MET`; depois → `MISSED`;
 * - pendente e vencido (agora > prazo) → `BREACHED`;
 * - pendente com menos de 20% do prazo total restante → `AT_RISK`;
 * - caso contrário → `OK`.
 */
export function computeSlaState(input: {
  startAt: DateLike;
  dueAt: DateLike | null;
  completedAt: DateLike | null;
  now: DateLike;
}): SlaState | null {
  if (input.dueAt === null) {
    return null;
  }
  const due = toMs(input.dueAt);
  if (input.completedAt !== null) {
    return toMs(input.completedAt) <= due ? "MET" : "MISSED";
  }
  const now = toMs(input.now);
  if (now > due) {
    return "BREACHED";
  }
  const total = due - toMs(input.startAt);
  const remaining = due - now;
  // remaining / total < 0.2, em inteiros para não sofrer com ponto flutuante.
  return remaining * 5 < total ? "AT_RISK" : "OK";
}

/**
 * SLA de primeira resposta e de resolução de uma solicitação. Solicitação
 * cancelada sem resolução não é avaliada na resolução (`null`).
 */
export function computeTicketSla(
  ticket: {
    status: TicketStatus;
    openedAt: DateLike;
    firstResponseAt: DateLike | null;
    resolvedAt: DateLike | null;
    firstResponseDueAt: DateLike | null;
    resolutionDueAt: DateLike | null;
  },
  now: DateLike
): TicketSla {
  return {
    firstResponse: computeSlaState({
      startAt: ticket.openedAt,
      dueAt: ticket.firstResponseDueAt,
      completedAt: ticket.firstResponseAt,
      now,
    }),
    resolution:
      ticket.status === "CANCELLED" && ticket.resolvedAt === null
        ? null
        : computeSlaState({
            startAt: ticket.openedAt,
            dueAt: ticket.resolutionDueAt,
            completedAt: ticket.resolvedAt,
            now,
          }),
  };
}

/** Prazo = abertura + minutos da política (sempre relativo a `openedAt`). */
export function slaDueAt(openedAt: Date, minutes: number): Date {
  return new Date(openedAt.getTime() + minutes * 60_000);
}

const ReportDateTimeSchema = z.string().datetime({ offset: true });

export const SlaReportQuerySchema = z
  .object({
    from: ReportDateTimeSchema.optional(),
    to: ReportDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    value =>
      !value.from ||
      !value.to ||
      new Date(value.from).getTime() <= new Date(value.to).getTime(),
    {
      message: "A data inicial deve ser anterior ou igual à data final.",
      path: ["to"],
    }
  );

const CountSchema = z.number().int().nonnegative();
const RateSchema = z.number().min(0).max(1).nullable();

/** Indicadores de SLA de um recorte (prioridade ou total geral). */
export const SlaReportCountsSchema = z.object({
  /** Solicitações abertas no período. */
  opened: CountSchema,
  /** Com prazo de 1ª resposta e resultado conhecido (cumprido ou vencido). */
  firstResponseEvaluated: CountSchema,
  firstResponseOnTime: CountSchema,
  /** onTime / evaluated, entre 0 e 1; `null` quando evaluated = 0. */
  firstResponseRate: RateSchema,
  resolutionEvaluated: CountSchema,
  resolutionOnTime: CountSchema,
  resolutionRate: RateSchema,
  /** Em aberto agora com algum prazo vencido (independe do período). */
  breachedOpen: CountSchema,
});

export const SlaReportRowSchema = SlaReportCountsSchema.extend({
  priority: TicketPrioritySchema,
});

export const SlaReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
  }),
  items: z.array(SlaReportRowSchema),
  totals: SlaReportCountsSchema,
});

export type SlaReportQuery = z.infer<typeof SlaReportQuerySchema>;
export type SlaReportCounts = z.infer<typeof SlaReportCountsSchema>;
export type SlaReportRow = z.infer<typeof SlaReportRowSchema>;
export type SlaReport = z.infer<typeof SlaReportSchema>;
