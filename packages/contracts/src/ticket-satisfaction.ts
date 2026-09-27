import { z } from "zod";

/** Validade do link de avaliação enviado ao cliente (C5.4). */
export const TICKET_SATISFACTION_TTL_DAYS = 7;

/** Tamanho máximo do comentário livre do cliente. */
export const TICKET_SATISFACTION_COMMENT_MAX = 2000;

/** Token público: 32 bytes aleatórios em base64url (43 caracteres). */
export const TicketSatisfactionTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Token de avaliação inválido.");

export const TicketSatisfactionRatingSchema = z.number().int().min(1).max(5);

/** Resposta do cliente na página pública. */
export const TicketSatisfactionResponseInputSchema = z
  .object({
    rating: TicketSatisfactionRatingSchema,
    comment: z
      .string()
      .trim()
      .max(TICKET_SATISFACTION_COMMENT_MAX)
      .optional()
      .transform(value => (value ? value : undefined)),
  })
  .strict();

/** Geração de um novo link; `version` opcional protege contra corrida. */
export const TicketSatisfactionLinkInputSchema = z
  .object({
    version: z.number().int().min(1).optional(),
  })
  .strict();

export const TicketSatisfactionStateSchema = z.enum([
  "PENDING",
  "RESPONDED",
  "EXPIRED",
]);

/** Estado da pesquisa para a equipe (nunca inclui token nem hash). */
export const TicketSatisfactionSurveySchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  state: TicketSatisfactionStateSchema,
  expiresAt: z.string().datetime(),
  rating: TicketSatisfactionRatingSchema.nullable(),
  comment: z.string().nullable(),
  respondedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  version: z.number().int().min(1),
});

/** `GET /tickets/:id/satisfaction`: `survey` nulo antes da 1ª resolução. */
export const TicketSatisfactionStatusSchema = z.object({
  survey: TicketSatisfactionSurveySchema.nullable(),
});

/** Link devolvido uma única vez (na resolução ou ao gerar um novo). */
export const TicketSatisfactionLinkSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const TicketSatisfactionLinkResultSchema = z.object({
  survey: TicketSatisfactionSurveySchema,
  link: TicketSatisfactionLinkSchema,
});

/** Dados mínimos exibidos ao cliente na página pública. */
export const PublicTicketSatisfactionSchema = z.object({
  protocol: z.string(),
  subject: z.string(),
  organizationName: z.string(),
  expiresAt: z.string().datetime(),
});

export const PublicTicketSatisfactionResultSchema = z.object({
  rating: TicketSatisfactionRatingSchema,
  respondedAt: z.string().datetime(),
});

const ReportDateTimeSchema = z.string().datetime({ offset: true });

export const CsatReportQuerySchema = z
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

export const CsatReportSchema = z.object({
  asOf: z.string().datetime(),
  filters: z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
  }),
  /** Pesquisas geradas (solicitações resolvidas) no período. */
  sent: CountSchema,
  responded: CountSchema,
  /** respondidas / enviadas; `null` sem pesquisas. */
  responseRate: RateSchema,
  /** Média das notas (1 a 5); `null` sem respostas. */
  averageRating: z.number().min(1).max(5).nullable(),
  distribution: z.object({
    "1": CountSchema,
    "2": CountSchema,
    "3": CountSchema,
    "4": CountSchema,
    "5": CountSchema,
  }),
  /** Notas 4 e 5 sobre respondidas; `null` sem respostas. */
  csat: RateSchema,
});

export type TicketSatisfactionResponseInput = z.infer<
  typeof TicketSatisfactionResponseInputSchema
>;
export type TicketSatisfactionLinkInput = z.infer<
  typeof TicketSatisfactionLinkInputSchema
>;
export type TicketSatisfactionState = z.infer<
  typeof TicketSatisfactionStateSchema
>;
export type TicketSatisfactionSurvey = z.infer<
  typeof TicketSatisfactionSurveySchema
>;
export type TicketSatisfactionStatus = z.infer<
  typeof TicketSatisfactionStatusSchema
>;
export type TicketSatisfactionLink = z.infer<
  typeof TicketSatisfactionLinkSchema
>;
export type TicketSatisfactionLinkResult = z.infer<
  typeof TicketSatisfactionLinkResultSchema
>;
export type PublicTicketSatisfaction = z.infer<
  typeof PublicTicketSatisfactionSchema
>;
export type PublicTicketSatisfactionResult = z.infer<
  typeof PublicTicketSatisfactionResultSchema
>;
export type CsatReportQuery = z.infer<typeof CsatReportQuerySchema>;
export type CsatReport = z.infer<typeof CsatReportSchema>;

const CSAT_RATING_KEYS = ["1", "2", "3", "4", "5"] as const;

/** Resume a distribuição 1–5 em taxa de resposta, média e CSAT%. */
export function summarizeCsat(
  sent: number,
  distribution: CsatReport["distribution"]
): Pick<CsatReport, "responded" | "responseRate" | "averageRating" | "csat"> {
  let responded = 0;
  let sum = 0;
  for (const key of CSAT_RATING_KEYS) {
    responded += distribution[key];
    sum += Number(key) * distribution[key];
  }
  return {
    responded,
    responseRate: sent === 0 ? null : responded / sent,
    averageRating: responded === 0 ? null : sum / responded,
    csat:
      responded === 0
        ? null
        : (distribution["4"] + distribution["5"]) / responded,
  };
}
