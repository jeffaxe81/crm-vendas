import { Inject, Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import {
  decryptWebhookSecret,
  webhookEncryptionKey,
} from "../../webhooks/webhook-secret";
import { HttpsEmailRelayProvider } from "./email-http-relay.provider";
import type { EmailRelaySettingsContext } from "./email-relay-settings.service";

export type RelayReadinessCheck = "PASS" | "BLOCKED" | "NOT_VERIFIED";

export type RelayReadinessReport = Readonly<{
  mode: "DISABLED" | "PREPARED";
  version: number;
  sendingEnabled: false;
  activationEligible: false;
  checks: Readonly<{
    relayConfigured: RelayReadinessCheck;
    hostnameAllowlisted: RelayReadinessCheck;
    encryptionKeyPresent: RelayReadinessCheck;
    credentialIntegrity: RelayReadinessCheck;
    providerContractCompatible: RelayReadinessCheck;
    durableProviderIdempotency: "NOT_VERIFIED";
    networkEgressPolicy: "NOT_VERIFIED";
    tlsAndDnsPinning: "NOT_VERIFIED";
    externalApproval: "NOT_VERIFIED";
    senderRegistration: "BLOCKED";
  }>;
  blockers: readonly string[];
}>;

/**
 * Administrative pre-flight inspection, not a health probe and not approval
 * to send. No HTTP request, DNS lookup or EmailProvider registration occurs.
 * Remote idempotency, egress and TLS/DNS policy must be verified out of band.
 */
@Injectable()
export class EmailRelayReadinessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async inspect(
    context: EmailRelaySettingsContext
  ): Promise<RelayReadinessReport> {
    return this.prisma.withTenant(context.organizationId, async tenant => {
      const membership = await tenant.organizationMembership.findFirst({
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
      if (!membership) {
        throw new ForbiddenException({
          code: "EMAIL_RELAY_ADMIN_REQUIRED",
        });
      }

      const row = await tenant.emailRelaySettings.findFirst({
        where: { organizationId: context.organizationId },
        select: {
          mode: true,
          version: true,
          endpoint: true,
          encryptedBearerToken: true,
        },
      });

      const key = process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY;
      const allowedHostname = process.env.EMAIL_RELAY_ALLOWED_HOSTNAME;
      let encryptionKeyPresent = false;
      let token: string | null = null;
      try {
        webhookEncryptionKey(key);
        encryptionKeyPresent = true;
      } catch {
        // A missing/invalid local encryption key blocks readiness.
      }
      if (encryptionKeyPresent && row?.encryptedBearerToken) {
        try {
          token = decryptWebhookSecret(
            row.encryptedBearerToken,
            key!,
            `email-relay-settings:${context.organizationId}:v1`
          );
        } catch {
          // Corrupt ciphertext or wrong-tenant AAD fails closed.
        }
      }

      let hostnameAllowlisted = false;
      let providerContractCompatible = false;
      if (allowedHostname && row?.endpoint) {
        try {
          // Constructor validates URL, hostname, credentials and timeout.
          // It never performs DNS resolution or sends a request.
          new HttpsEmailRelayProvider({
            endpoint: row.endpoint,
            allowedHostname,
            bearerToken: "preflight-only-validation-token-2026",
          });
          hostnameAllowlisted = true;
        } catch {
          // The endpoint or allowlist is no longer valid.
        }
      }
      if (hostnameAllowlisted && token !== null) {
        try {
          new HttpsEmailRelayProvider({
            endpoint: row!.endpoint!,
            allowedHostname: allowedHostname!,
            bearerToken: token,
          });
          providerContractCompatible = true;
        } catch {
          // Check failure without logging credentials or error payloads.
        }
      }

      const checks = {
        relayConfigured:
          row?.mode === "PREPARED" ? "PASS" : "BLOCKED",
        hostnameAllowlisted: hostnameAllowlisted ? "PASS" : "BLOCKED",
        encryptionKeyPresent: encryptionKeyPresent ? "PASS" : "BLOCKED",
        credentialIntegrity: token !== null ? "PASS" : "BLOCKED",
        providerContractCompatible:
          providerContractCompatible ? "PASS" : "BLOCKED",
        durableProviderIdempotency: "NOT_VERIFIED",
        networkEgressPolicy: "NOT_VERIFIED",
        tlsAndDnsPinning: "NOT_VERIFIED",
        externalApproval: "NOT_VERIFIED",
        senderRegistration: "BLOCKED",
      } as const;

      const blockers = Object.entries(checks)
        .filter(([, value]) => value !== "PASS")
        .map(([code]) => code);

      return {
        mode: row?.mode === "PREPARED" ? "PREPARED" : "DISABLED",
        version: row?.version ?? 0,
        sendingEnabled: false,
        activationEligible: false,
        checks,
        blockers,
      };
    });
  }
}
