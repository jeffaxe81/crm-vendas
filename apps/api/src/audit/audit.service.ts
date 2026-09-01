import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";

export type AuditRecordInput = {
  organizationId: string;
  actorUserId?: string | null;
  requestId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        requestId: input.requestId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before,
        after: input.after,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}
