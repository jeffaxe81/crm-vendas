import { isIP } from "node:net";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import {
  encryptWebhookSecret,
  webhookEncryptionKey,
} from "../../webhooks/webhook-secret";

export type EmailRelaySettingsContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  requestId: string;
  ipAddress?: string | null;
}>;

export type EmailRelaySettingsUpdate = Readonly<{
  version: number;
  mode: "DISABLED" | "PREPARED";
  endpoint?: string;
  bearerToken?: string;
  clearCredential?: boolean;
}>;

type SettingsRow = Readonly<{
  version: number;
  mode: string;
  endpoint: string | null;
  encryptedBearerToken: string | null;
}>;

function summary(row?: SettingsRow | null) {
  return {
    version: row?.version ?? 0,
    mode: row?.mode ?? "DISABLED",
    endpoint: row?.endpoint ?? null,
    hasCredential: Boolean(row?.encryptedBearerToken),
    // PREPARED is only a proposal for a later operational gate.
    sendingEnabled: false,
  };
}

function verifyRelayEndpoint(endpoint: string): string {
  const allowedHostname = process.env.EMAIL_RELAY_ALLOWED_HOSTNAME;
  if (
    !allowedHostname ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(allowedHostname) ||
    isIP(allowedHostname) !== 0
  ) {
    throw new ServiceUnavailableException({
      code: "EMAIL_RELAY_HOST_ALLOWLIST_UNAVAILABLE",
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new BadRequestException({ code: "EMAIL_RELAY_ENDPOINT_INVALID" });
  }
  if (
    endpoint.length > 512 ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== allowedHostname ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !/^\/[A-Za-z0-9/_-]+$/.test(parsed.pathname) ||
    parsed.href !== endpoint
  ) {
    throw new BadRequestException({ code: "EMAIL_RELAY_ENDPOINT_INVALID" });
  }
  return endpoint;
}

function encryptBearer(token: string, organizationId: string): string {
  if (!/^[A-Za-z0-9._~+/=-]{16,1024}$/.test(token)) {
    throw new BadRequestException({ code: "EMAIL_RELAY_TOKEN_INVALID" });
  }
  const key = process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY;
  try {
    webhookEncryptionKey(key);
  } catch {
    throw new ServiceUnavailableException({
      code: "EMAIL_RELAY_ENCRYPTION_UNAVAILABLE",
    });
  }
  return encryptWebhookSecret(
    token,
    key!,
    `email-relay-settings:${organizationId}:v1`
  );
}

/** Control-plane staging only: no remote calls and no sender registration. */
@Injectable()
export class EmailRelaySettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    context: EmailRelaySettingsContext
  ) {
    const member = await tx.organizationMembership.findFirst({
      where: {
        organizationId: context.organizationId,
        userId: context.actorUserId,
        isActive: true,
        user: { isActive: true },
        organization: { isActive: true },
        OR: [{ role: "ADMIN" }, { isSuperuser: true }],
      },
      select: { id: true },
    });
    if (!member)
      throw new ForbiddenException({ code: "EMAIL_RELAY_ADMIN_REQUIRED" });
  }

  async read(context: EmailRelaySettingsContext) {
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdmin(tx, context);
      return summary(
        await tx.emailRelaySettings.findFirst({
          where: { organizationId: context.organizationId },
        })
      );
    });
  }

  async update(
    input: EmailRelaySettingsUpdate,
    context: EmailRelaySettingsContext
  ) {
    if (
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      (input.clearCredential === true && input.bearerToken !== undefined)
    ) {
      throw new BadRequestException({ code: "EMAIL_RELAY_SETTINGS_INVALID" });
    }
    if (!["DISABLED", "PREPARED"].includes(input.mode)) {
      throw new BadRequestException({ code: "EMAIL_RELAY_MODE_INVALID" });
    }
    const endpoint =
      input.endpoint === undefined
        ? undefined
        : verifyRelayEndpoint(input.endpoint);
    // Encryption occurs before DB access; secrets never enter audit or logs.
    const encrypted =
      input.bearerToken === undefined
        ? undefined
        : encryptBearer(input.bearerToken, context.organizationId);

    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdmin(tx, context);
      const previous = await tx.emailRelaySettings.findFirst({
        where: { organizationId: context.organizationId },
      });
      if ((previous?.version ?? 0) !== input.version) {
        throw new ConflictException({ code: "EMAIL_RELAY_VERSION_CONFLICT" });
      }
      const nextEndpoint = endpoint ?? previous?.endpoint ?? null;
      const nextEncrypted = input.clearCredential
        ? null
        : encrypted ?? previous?.encryptedBearerToken ?? null;
      if (input.mode === "PREPARED") {
        if (!nextEndpoint || !nextEncrypted)
          throw new BadRequestException({
            code: "EMAIL_RELAY_SETTINGS_INCOMPLETE",
          });
        verifyRelayEndpoint(nextEndpoint);
        try {
          webhookEncryptionKey(process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY);
        } catch {
          throw new ServiceUnavailableException({
            code: "EMAIL_RELAY_ENCRYPTION_UNAVAILABLE",
          });
        }
      }
      const data = {
        mode: input.mode,
        endpoint: nextEndpoint,
        encryptedBearerToken: nextEncrypted,
      };
      if (!previous) {
        const created = await tx.emailRelaySettings.createMany({
          data: [
            {
              organizationId: context.organizationId,
              ...data,
              version: 1,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count !== 1) {
          throw new ConflictException({ code: "EMAIL_RELAY_VERSION_CONFLICT" });
        }
      } else {
        const changed = await tx.emailRelaySettings.updateMany({
          where: {
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { ...data, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          throw new ConflictException({ code: "EMAIL_RELAY_VERSION_CONFLICT" });
        }
      }
      const updated = await tx.emailRelaySettings.findFirstOrThrow({
        where: { organizationId: context.organizationId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          action: "email.relay_settings.updated",
          entityType: "EmailRelaySettings",
          entityId: context.organizationId,
          before: summary(previous),
          after: summary(updated),
          metadata: { tokenRotated: encrypted !== undefined },
        },
      });
      return summary(updated);
    });
  }
}
