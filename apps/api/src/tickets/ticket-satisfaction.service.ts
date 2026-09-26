import { createHash, randomBytes } from "node:crypto";

import {
  TICKET_SATISFACTION_TTL_DAYS,
  TicketSatisfactionTokenSchema,
  type PublicTicketSatisfaction,
  type PublicTicketSatisfactionResult,
  type TicketSatisfactionLink,
  type TicketSatisfactionLinkInput,
  type TicketSatisfactionLinkResult,
  type TicketSatisfactionStatus,
  type TicketSatisfactionSurvey,
} from "@axes/contracts";
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { parseApiEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type { TicketAdministrationContext } from "./tickets.service";

const TTL_MS = TICKET_SATISFACTION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Status da solicitação em que faz sentido enviar um novo link. */
const LINK_STATUSES = new Set(["RESOLVED", "CLOSED"]);

type SurveyRecord = {
  id: string;
  ticketId: string;
  expiresAt: Date;
  rating: number | null;
  comment: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  version: number;
};

export type PublicRequestContext = {
  requestId: string;
  ipAddress?: string | null;
};

export type CreatedSatisfaction = {
  survey: TicketSatisfactionSurvey;
  link: TicketSatisfactionLink;
};

/** SHA-256 em hex do token público; só o hash vai para o banco. */
export function hashSatisfactionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 32 bytes aleatórios em base64url (43 caracteres). */
export function generateSatisfactionToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSatisfactionToken(token) };
}

const notFound = () =>
  new NotFoundException({
    code: "SATISFACTION_NOT_FOUND",
    message: "Link de avaliação inválido.",
  });

/**
 * C5.4 — pesquisa de satisfação (CSAT) da solicitação.
 *
 * A equipe consulta e gera links dentro do tenant (`withTenant`). O cliente
 * responde sem sessão: a pesquisa é localizada pelo hash do token numa
 * transação que só define `app.satisfaction_token_hash` (a policy
 * `ticket_satisfaction_surveys_token_lookup` libera a leitura apenas da linha
 * com aquele hash) e o restante roda no tenant dono da pesquisa.
 */
@Injectable()
export class TicketSatisfactionService {
  private webOrigin: string | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  /**
   * Cria a pesquisa na primeira resolução, dentro da transação da troca de
   * status. Reaberturas seguidas de nova resolução não criam outra.
   */
  async createOnResolution(
    tenant: Prisma.TransactionClient,
    ticketId: string,
    context: TicketAdministrationContext,
    now: Date
  ): Promise<CreatedSatisfaction | null> {
    const existing = await tenant.ticketSatisfactionSurvey.findFirst({
      where: { ticketId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (existing) {
      return null;
    }

    const { token, tokenHash } = generateSatisfactionToken();
    const survey = await tenant.ticketSatisfactionSurvey.create({
      data: {
        organizationId: context.organizationId,
        ticketId,
        tokenHash,
        expiresAt: new Date(now.getTime() + TTL_MS),
        createdBy: context.actorUserId,
        updatedBy: context.actorUserId,
      },
    });
    return {
      survey: this.toView(survey, now),
      link: this.toLink(token, survey.expiresAt),
    };
  }

  recordCreated(
    created: CreatedSatisfaction,
    context: TicketAdministrationContext
  ) {
    return this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "ticket.satisfaction_created",
      entityType: "ticket_satisfaction_survey",
      entityId: created.survey.id,
      after: { expiresAt: created.survey.expiresAt },
      metadata: { ticketId: created.survey.ticketId },
      ipAddress: context.ipAddress ?? null,
    });
  }

  async read(
    ticketId: string,
    organizationId: string,
    now: Date = new Date()
  ): Promise<TicketSatisfactionStatus> {
    const survey = await this.prisma.withTenant(
      organizationId,
      async tenant => {
        await this.requireTicket(tenant, ticketId, organizationId);
        return tenant.ticketSatisfactionSurvey.findFirst({
          where: { ticketId, organizationId },
        });
      }
    );
    return { survey: survey ? this.toView(survey, now) : null };
  }

  /** Gera um novo token (o anterior deixa de valer) e devolve a URL uma vez. */
  async generateLink(
    ticketId: string,
    input: TicketSatisfactionLinkInput,
    context: TicketAdministrationContext,
    now: Date = new Date()
  ): Promise<TicketSatisfactionLinkResult> {
    const { token, tokenHash } = generateSatisfactionToken();
    const expiresAt = new Date(now.getTime() + TTL_MS);

    const survey = await this.prisma.withTenant(
      context.organizationId,
      async tenant => {
        const ticket = await this.requireTicket(
          tenant,
          ticketId,
          context.organizationId
        );
        const existing = await tenant.ticketSatisfactionSurvey.findFirst({
          where: { ticketId, organizationId: context.organizationId },
        });
        if (!existing) {
          throw new NotFoundException({
            code: "TICKET_SATISFACTION_NOT_FOUND",
            message:
              "A pesquisa de satisfação é criada ao resolver a solicitação.",
          });
        }
        if (existing.respondedAt) {
          throw this.alreadyResponded();
        }
        if (!LINK_STATUSES.has(ticket.status)) {
          throw new BadRequestException({
            code: "TICKET_SATISFACTION_UNAVAILABLE",
            message:
              "O link de avaliação só pode ser gerado para solicitação resolvida ou encerrada.",
          });
        }
        if (input.version !== undefined && input.version !== existing.version) {
          throw this.versionConflict();
        }

        const result = await tenant.ticketSatisfactionSurvey.updateMany({
          where: {
            id: existing.id,
            organizationId: context.organizationId,
            version: existing.version,
            respondedAt: null,
          },
          data: {
            tokenHash,
            expiresAt,
            updatedBy: context.actorUserId,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw this.versionConflict();
        }
        const updated = await tenant.ticketSatisfactionSurvey.findFirst({
          where: { id: existing.id, organizationId: context.organizationId },
        });
        if (!updated) {
          throw this.versionConflict();
        }
        return updated;
      }
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "ticket.satisfaction_link_generated",
      entityType: "ticket_satisfaction_survey",
      entityId: survey.id,
      after: {
        expiresAt: survey.expiresAt.toISOString(),
        version: survey.version,
      },
      metadata: { ticketId },
      ipAddress: context.ipAddress ?? null,
    });

    return {
      survey: this.toView(survey, now),
      link: this.toLink(token, survey.expiresAt),
    };
  }

  /** Página pública: só protocolo, assunto e nome da organização. */
  async readPublic(
    token: string,
    now: Date = new Date()
  ): Promise<PublicTicketSatisfaction> {
    const located = await this.locate(token);
    return this.prisma.withTenant(located.organizationId, async tenant => {
      const { survey, ticket, organizationName } = await this.loadPublic(
        tenant,
        located
      );
      this.assertOpen(survey, now);
      return {
        protocol: ticket.protocol,
        subject: ticket.subject,
        organizationName,
        expiresAt: survey.expiresAt.toISOString(),
      };
    });
  }

  /** Resposta única do cliente: grava nota, timeline e auditoria. */
  async respondPublic(
    token: string,
    input: { rating: number; comment?: string | undefined },
    request: PublicRequestContext,
    now: Date = new Date()
  ): Promise<PublicTicketSatisfactionResult> {
    const located = await this.locate(token);
    const survey = await this.prisma.withTenant(
      located.organizationId,
      async tenant => {
        const { survey: current } = await this.loadPublic(tenant, located);
        this.assertOpen(current, now);

        const result = await tenant.ticketSatisfactionSurvey.updateMany({
          where: {
            id: current.id,
            organizationId: located.organizationId,
            tokenHash: located.tokenHash,
            respondedAt: null,
          },
          data: {
            rating: input.rating,
            comment: input.comment ?? null,
            respondedAt: now,
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw this.alreadyResponded();
        }

        // `ticket_events.author_user_id` é obrigatório; o evento fica em nome
        // de quem resolveu a solicitação e a origem vai em `metadata`.
        await tenant.ticketEvent.create({
          data: {
            organizationId: located.organizationId,
            ticketId: current.ticketId,
            type: "COMMENT",
            isInternal: true,
            body: input.comment
              ? `Avaliação do cliente: ${input.rating}/5\nComentário: ${input.comment}`
              : `Avaliação do cliente: ${input.rating}/5`,
            metadata: {
              source: "CUSTOMER_SATISFACTION",
              surveyId: current.id,
              rating: input.rating,
            },
            authorUserId: current.createdBy,
          },
        });
        return { ...current, rating: input.rating, respondedAt: now };
      }
    );

    await this.audit.record({
      organizationId: located.organizationId,
      actorUserId: null,
      requestId: request.requestId,
      action: "ticket.satisfaction_responded",
      entityType: "ticket_satisfaction_survey",
      entityId: survey.id,
      after: { rating: input.rating, hasComment: Boolean(input.comment) },
      metadata: { ticketId: survey.ticketId, source: "public_link" },
      ipAddress: request.ipAddress ?? null,
    });

    return { rating: input.rating, respondedAt: now.toISOString() };
  }

  /**
   * Resolve token → (organização, pesquisa) sem contexto de tenant. A
   * transação só enxerga a linha cujo hash foi informado (policy de RLS
   * `…_token_lookup`, somente SELECT). Token malformado, inexistente ou de
   * outro tenant dão o mesmo 404.
   */
  private async locate(token: string) {
    if (!TicketSatisfactionTokenSchema.safeParse(token).success) {
      throw notFound();
    }
    const tokenHash = hashSatisfactionToken(token);
    const found = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        SELECT set_config('app.satisfaction_token_hash', ${tokenHash}, true)
      `;
      return tx.ticketSatisfactionSurvey.findUnique({
        where: { tokenHash },
        select: { id: true, organizationId: true },
      });
    });
    if (!found) {
      throw notFound();
    }
    return {
      surveyId: found.id,
      organizationId: found.organizationId,
      tokenHash,
    };
  }

  private async loadPublic(
    tenant: Prisma.TransactionClient,
    located: { surveyId: string; organizationId: string; tokenHash: string }
  ) {
    const survey = await tenant.ticketSatisfactionSurvey.findFirst({
      where: {
        id: located.surveyId,
        organizationId: located.organizationId,
        tokenHash: located.tokenHash,
      },
      include: {
        ticket: { select: { protocol: true, subject: true, deletedAt: true } },
        organization: { select: { name: true } },
      },
    });
    if (!survey || survey.ticket.deletedAt) {
      throw notFound();
    }
    return {
      survey,
      ticket: survey.ticket,
      organizationName: survey.organization.name,
    };
  }

  private assertOpen(survey: SurveyRecord, now: Date) {
    if (survey.respondedAt) {
      throw this.alreadyResponded();
    }
    if (survey.expiresAt.getTime() <= now.getTime()) {
      throw new GoneException({
        code: "SATISFACTION_EXPIRED",
        message: "Este link de avaliação expirou.",
      });
    }
  }

  private alreadyResponded() {
    return new ConflictException({
      code: "SATISFACTION_ALREADY_RESPONDED",
      message: "Esta avaliação já foi respondida.",
    });
  }

  private versionConflict() {
    return new ConflictException({
      code: "TICKET_SATISFACTION_VERSION_CONFLICT",
      message: "A pesquisa foi alterada por outra operação.",
    });
  }

  private async requireTicket(
    tenant: Prisma.TransactionClient,
    id: string,
    organizationId: string
  ) {
    const ticket = await tenant.ticket.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: "TICKET_NOT_FOUND",
        message: "Solicitação não encontrada.",
      });
    }
    return ticket;
  }

  private toView(survey: SurveyRecord, now: Date): TicketSatisfactionSurvey {
    return {
      id: survey.id,
      ticketId: survey.ticketId,
      state: survey.respondedAt
        ? "RESPONDED"
        : survey.expiresAt.getTime() <= now.getTime()
          ? "EXPIRED"
          : "PENDING",
      expiresAt: survey.expiresAt.toISOString(),
      rating: survey.rating,
      comment: survey.comment,
      respondedAt: survey.respondedAt?.toISOString() ?? null,
      createdAt: survey.createdAt.toISOString(),
      version: survey.version,
    };
  }

  private toLink(token: string, expiresAt: Date): TicketSatisfactionLink {
    this.webOrigin ??= parseApiEnvironment(process.env).WEB_ORIGIN.replace(
      /\/+$/,
      ""
    );
    return {
      url: `${this.webOrigin}/avaliacao/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
