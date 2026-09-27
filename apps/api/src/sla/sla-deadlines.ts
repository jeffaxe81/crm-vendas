import { slaDueAt, type TicketPriority } from "@axes/contracts";

import type { Prisma } from "../generated/prisma/client";

export type SlaDeadlines = {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
};

/**
 * C5.3 — prazos da solicitação pela política ativa da prioridade, em minutos
 * corridos (24x7) a partir de `openedAt`. Sem política ativa, os prazos ficam
 * nulos. Roda dentro da transação do chamador (`withTenant`).
 */
export async function resolveSlaDeadlines(
  tenant: Prisma.TransactionClient,
  organizationId: string,
  priority: TicketPriority,
  openedAt: Date
): Promise<SlaDeadlines> {
  const policy = await tenant.slaPolicy.findFirst({
    where: { organizationId, priority, isActive: true },
    select: { firstResponseMinutes: true, resolutionMinutes: true },
  });
  if (!policy) {
    return { firstResponseDueAt: null, resolutionDueAt: null };
  }
  return {
    firstResponseDueAt: slaDueAt(openedAt, policy.firstResponseMinutes),
    resolutionDueAt: slaDueAt(openedAt, policy.resolutionMinutes),
  };
}
