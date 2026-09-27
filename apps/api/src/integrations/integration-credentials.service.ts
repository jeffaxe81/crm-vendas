import type {
  IntegrationCredentialCreateInput,
  IntegrationCredentialCreated,
  IntegrationCredentialSummary,
  MembershipRole,
} from "@axes/contracts";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { generateApiKey, hashApiKey } from "../authorization/api-key-hash";
import {
  permissionsForRole,
  type Permission,
} from "../authorization/permissions";
import { PrismaService } from "../database/prisma.service";

export type IntegrationCredentialContext = {
  organizationId: string;
  actorUserId: string;
  actorRole: MembershipRole;
  requestId: string;
  ipAddress?: string | null;
};

@Injectable()
export class IntegrationCredentialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(organizationId: string): Promise<IntegrationCredentialSummary[]> {
    const credentials = await this.prisma.integrationCredential.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return credentials.map(credential => this.toSummary(credential));
  }

  async create(
    input: IntegrationCredentialCreateInput,
    context: IntegrationCredentialContext
  ): Promise<IntegrationCredentialCreated> {
    // Nunca conceder um escopo que o próprio criador não possui hoje —
    // a intersecção em tempo de uso (no guard) é defesa adicional, não
    // um motivo para relaxar esta checagem na criação.
    const grantable = permissionsForRole(context.actorRole);
    const invalidScopes = input.scopes.filter(
      scope => !grantable.includes(scope as Permission)
    );
    if (invalidScopes.length > 0) {
      throw new BadRequestException({
        code: "SCOPE_EXCEEDS_ROLE",
        message: `Escopo(s) não permitido(s) para o seu papel atual: ${invalidScopes.join(", ")}.`,
      });
    }

    const { plainKey, keyPrefix } = generateApiKey();
    const keyHash = hashApiKey(plainKey);

    const credential = await this.prisma.integrationCredential.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        keyHash,
        keyPrefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: context.actorUserId,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "integration.credential.created",
      entityType: "integration_credential",
      entityId: credential.id,
      after: {
        name: credential.name,
        keyPrefix: credential.keyPrefix,
        scopes: credential.scopes,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
      },
      ipAddress: context.ipAddress ?? null,
    });

    return { ...this.toSummary(credential), plainKey };
  }

  async revoke(
    id: string,
    context: IntegrationCredentialContext
  ): Promise<void> {
    const credential = await this.prisma.integrationCredential.findFirst({
      where: { id, organizationId: context.organizationId },
    });

    if (!credential) {
      throw new NotFoundException({
        code: "INTEGRATION_CREDENTIAL_NOT_FOUND",
        message: "Credencial não encontrada.",
      });
    }

    if (credential.revokedAt) {
      return;
    }

    const revokedAt = new Date();
    await this.prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        isActive: false,
        revokedAt,
        revokedBy: context.actorUserId,
      },
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      action: "integration.credential.revoked",
      entityType: "integration_credential",
      entityId: credential.id,
      before: { isActive: true },
      after: { isActive: false, revokedAt: revokedAt.toISOString() },
      ipAddress: context.ipAddress ?? null,
    });
  }

  private toSummary(credential: {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    isActive: boolean;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
    revokedAt: Date | null;
  }): IntegrationCredentialSummary {
    return {
      id: credential.id,
      name: credential.name,
      keyPrefix: credential.keyPrefix,
      scopes: credential.scopes,
      isActive: credential.isActive,
      lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
      expiresAt: credential.expiresAt?.toISOString() ?? null,
      createdAt: credential.createdAt.toISOString(),
      revokedAt: credential.revokedAt?.toISOString() ?? null,
    };
  }
}
