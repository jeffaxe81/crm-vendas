import {
  CsatReportQuerySchema,
  CsatReportSchema,
  summarizeCsat,
  type CsatReport,
  type CsatReportQuery,
} from "@axes/contracts";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

type CsatRow = {
  sent: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
};

/** Valida a query estrita do relatório; erros viram 400 VALIDATION_ERROR. */
export function parseCsatReportQuery(
  query: Record<string, unknown>
): CsatReportQuery {
  const parsed = CsatReportQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues.map(issue => issue.message),
    });
  }
  return parsed.data;
}

/**
 * C5.4 — satisfação do atendimento. O período filtra a data de criação da
 * pesquisa (primeira resolução da solicitação), com limites inclusivos.
 */
@Injectable()
export class CsatReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    query: CsatReportQuery
  ): Promise<CsatReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return this.prisma.withTenant(organizationId, async tenant => {
      const asOf = new Date();
      // O filtro explícito por organização se soma ao RLS do banco.
      const conditions: Prisma.Sql[] = [
        Prisma.sql`s.organization_id = ${organizationId}::uuid`,
        Prisma.sql`t.deleted_at IS NULL`,
      ];
      if (from) {
        conditions.push(Prisma.sql`s.created_at >= ${from}`);
      }
      if (to) {
        conditions.push(Prisma.sql`s.created_at <= ${to}`);
      }
      const where = Prisma.join(conditions, " AND ");

      const [row] = await tenant.$queryRaw<CsatRow[]>`
        SELECT
          COUNT(*)::int AS sent,
          COUNT(*) FILTER (WHERE s.rating = 1)::int AS r1,
          COUNT(*) FILTER (WHERE s.rating = 2)::int AS r2,
          COUNT(*) FILTER (WHERE s.rating = 3)::int AS r3,
          COUNT(*) FILTER (WHERE s.rating = 4)::int AS r4,
          COUNT(*) FILTER (WHERE s.rating = 5)::int AS r5
        FROM ticket_satisfaction_surveys s
        JOIN tickets t
          ON t.id = s.ticket_id
         AND t.organization_id = s.organization_id
        WHERE ${where}`;
      if (!row) {
        throw new Error("CSAT aggregate returned no row.");
      }

      const sent = Number(row.sent);
      const distribution = {
        "1": Number(row.r1),
        "2": Number(row.r2),
        "3": Number(row.r3),
        "4": Number(row.r4),
        "5": Number(row.r5),
      };

      return CsatReportSchema.parse({
        asOf: asOf.toISOString(),
        filters: {
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
        },
        sent,
        distribution,
        ...summarizeCsat(sent, distribution),
      });
    });
  }
}
