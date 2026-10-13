import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  encryptWebhookSecret,
  webhookEncryptionKey,
} from "../../webhooks/webhook-secret";

/**
 * F4.3-03B2 offline trusted-source control plane.
 * NOT registered in EmailModule; no ingress endpoint, payload reader,
 * plaintext secret accessor, source activation or provider network call.
 */
export type InboundSourceAdminContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  requestId: string;
}>;

export type InboundSourceCreation = Readonly<{
  routeKey: string;
  sourceKey: string;
  keyId: string;
  /** Canonical base64 of 32-128 independently generated secret bytes. */
  secretBase64: string;
}>;

export type InboundSourceRotation = Readonly<{
  routeKey: string;
  keyId: string;
  secretBase64: string;
  expectedVersion: number;
}>;

export type InboundSourceRevocation = Readonly<{
  routeKey: string;
  keyId: string;
  expectedVersion: number;
}>;

export type InboundSourceMetadata = Readonly<{
  routeKey: string;
  sourceKey: string;
  version: number;
  enabled: false;
  keys: readonly Readonly<{ keyId: string; revoked: boolean }>[];
}>;

type RouteRow = {
  route_key: string;
  source_key: string;
  version: number;
  enabled: boolean;
};
type KeyRow = { key_id: string; revoked: boolean };

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const ROUTE = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const KEY = /^[a-z0-9][a-z0-9._-]{1,47}$/;

function forbidden(): never {
  throw new ForbiddenException({ code: "INBOUND_SOURCE_UNAVAILABLE" });
}
function conflict(): never {
  throw new ConflictException({ code: "INBOUND_SOURCE_VERSION_CONFLICT" });
}

function validatedSecret(value: string): string {
  if (typeof value !== "string" || value.length > 176) forbidden();
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length < 32 ||
    bytes.length > 128 ||
    bytes.toString("base64") !== value
  ) {
    forbidden();
  }
  return value;
}
function binding(org: string, route: string, key: string): string {
  return `inbound-email-source:v1:${org}:${route}:${key}`;
}

/** No secrets or activation flags can be read/written by a public endpoint. */
export class InboundSourceVault {
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    encryptionKey?: string
  ) {
    const candidate =
      encryptionKey ?? process.env.INBOUND_EMAIL_SOURCE_ENCRYPTION_KEY;
    try {
      webhookEncryptionKey(candidate);
    } catch {
      throw new ServiceUnavailableException({
        code: "INBOUND_SOURCE_ENCRYPTION_UNAVAILABLE",
      });
    }
    this.encryptionKey = candidate!;
  }

  private validateContext(context: InboundSourceAdminContext) {
    if (
      !context ||
      !UUID.test(context.organizationId) ||
      !UUID.test(context.actorUserId)
    ) forbidden();
  }

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    context: InboundSourceAdminContext
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
    if (!member) forbidden();
  }

  private async lockedRoute(
    tx: Prisma.TransactionClient,
    context: InboundSourceAdminContext,
    routeKey: string,
    expectedVersion: number
  ): Promise<RouteRow> {
    const [route] = await tx.$queryRaw<RouteRow[]>`
      SELECT route_key, source_key, version, enabled
      FROM public.inbound_email_sources
      WHERE organization_id = ${context.organizationId}::uuid
        AND route_key = ${routeKey}
      FOR UPDATE
    `;
    if (!route || route.version !== expectedVersion) conflict();
    return route;
  }

  async register(
    input: InboundSourceCreation,
    context: InboundSourceAdminContext
  ): Promise<InboundSourceMetadata> {
    this.validateContext(context);
    if (
      !input ||
      !ROUTE.test(input.routeKey) ||
      !ROUTE.test(input.sourceKey) ||
      !KEY.test(input.keyId)
    ) forbidden();
    const secret = validatedSecret(input.secretBase64);
    const org = context.organizationId;
    const encrypted = encryptWebhookSecret(
      secret,
      this.encryptionKey,
      binding(org, input.routeKey, input.keyId)
    );
    return this.prisma.withTenant(org, async tx => {
      await this.assertAdmin(tx, context);
      const inserted = await tx.$queryRaw<{ route_key: string }[]>`
        INSERT INTO public.inbound_email_sources
          (organization_id, route_key, source_key)
        VALUES (${org}::uuid, ${input.routeKey}, ${input.sourceKey})
        ON CONFLICT DO NOTHING
        RETURNING route_key
      `;
      if (inserted.length !== 1) conflict();
      await tx.$executeRaw`
        INSERT INTO public.inbound_email_source_keys
          (organization_id, route_key, key_id, encrypted_secret)
        VALUES (${org}::uuid, ${input.routeKey}, ${input.keyId}, ${encrypted})
      `;
      await tx.auditLog.create({
        data: {
          organizationId: org,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.inbound_source.registered",
          entityType: "InboundEmailSource",
          entityId: org,
          metadata: {
            routeKey: input.routeKey,
            sourceKey: input.sourceKey,
            keyId: input.keyId,
            enabled: false,
          },
        },
      });
      return {
        routeKey: input.routeKey,
        sourceKey: input.sourceKey,
        version: 1,
        enabled: false,
        keys: [{ keyId: input.keyId, revoked: false }],
      };
    });
  }

  /** Adds a new immutable key; old key can only be revoked, never overwritten. */
  async rotate(
    input: InboundSourceRotation,
    context: InboundSourceAdminContext
  ): Promise<InboundSourceMetadata> {
    this.validateContext(context);
    if (
      !input ||
      !ROUTE.test(input.routeKey) ||
      !KEY.test(input.keyId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    ) forbidden();
    const secret = validatedSecret(input.secretBase64);
    const org = context.organizationId;
    const encrypted = encryptWebhookSecret(
      secret,
      this.encryptionKey,
      binding(org, input.routeKey, input.keyId)
    );
    return this.prisma.withTenant(org, async tx => {
      await this.assertAdmin(tx, context);
      const route = await this.lockedRoute(
        tx, context, input.routeKey, input.expectedVersion
      );
      const inserted = await tx.$queryRaw<{ key_id: string }[]>`
        INSERT INTO public.inbound_email_source_keys
          (organization_id, route_key, key_id, encrypted_secret)
        VALUES (${org}::uuid, ${input.routeKey}, ${input.keyId}, ${encrypted})
        ON CONFLICT DO NOTHING
        RETURNING key_id
      `;
      if (inserted.length !== 1) conflict();
      await tx.$executeRaw`
        UPDATE public.inbound_email_sources
        SET version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = ${org}::uuid AND route_key = ${input.routeKey}
      `;
      await tx.auditLog.create({
        data: {
          organizationId: org, actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.inbound_source.key_rotated",
          entityType: "InboundEmailSource", entityId: org,
          metadata: { routeKey: input.routeKey, keyId: input.keyId, enabled: false },
        },
      });
      return this.readOne(tx, org, route.source_key, input.routeKey);
    });
  }

  /** Irreversible local revocation; no external token/revocation API. */
  async revoke(
    input: InboundSourceRevocation,
    context: InboundSourceAdminContext
  ): Promise<InboundSourceMetadata> {
    this.validateContext(context);
    if (
      !input ||
      !ROUTE.test(input.routeKey) ||
      !KEY.test(input.keyId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    ) forbidden();
    const org = context.organizationId;
    return this.prisma.withTenant(org, async tx => {
      await this.assertAdmin(tx, context);
      const route = await this.lockedRoute(
        tx, context, input.routeKey, input.expectedVersion
      );
      const revoked = await tx.$queryRaw<{ key_id: string }[]>`
        UPDATE public.inbound_email_source_keys
        SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP
        WHERE organization_id = ${org}::uuid
          AND route_key = ${input.routeKey} AND key_id = ${input.keyId}
          AND revoked = FALSE
        RETURNING key_id
      `;
      if (revoked.length !== 1) conflict();
      await tx.$executeRaw`
        UPDATE public.inbound_email_sources
        SET version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = ${org}::uuid AND route_key = ${input.routeKey}
      `;
      await tx.auditLog.create({
        data: {
          organizationId: org, actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.inbound_source.key_revoked",
          entityType: "InboundEmailSource", entityId: org,
          metadata: { routeKey: input.routeKey, keyId: input.keyId, enabled: false },
        },
      });
      return this.readOne(tx, org, route.source_key, input.routeKey);
    });
  }

  private async readOne(
    tx: Prisma.TransactionClient,
    org: string,
    sourceKey: string,
    routeKey: string
  ): Promise<InboundSourceMetadata> {
    const [route] = await tx.$queryRaw<RouteRow[]>`
      SELECT route_key, source_key, version, enabled
      FROM public.inbound_email_sources
      WHERE organization_id = ${org}::uuid AND route_key = ${routeKey}
    `;
    if (!route || route.enabled) forbidden();
    const keys = await tx.$queryRaw<KeyRow[]>`
      SELECT key_id, revoked FROM public.inbound_email_source_keys
      WHERE organization_id = ${org}::uuid AND route_key = ${routeKey}
      ORDER BY created_at, key_id
    `;
    return {
      routeKey: route.route_key,
      sourceKey, version: route.version, enabled: false,
      keys: keys.map(key => ({ keyId: key.key_id, revoked: key.revoked })),
    };
  }

  async list(context: InboundSourceAdminContext): Promise<InboundSourceMetadata[]> {
    this.validateContext(context);
    const org = context.organizationId;
    return this.prisma.withTenant(org, async tx => {
      await this.assertAdmin(tx, context);
      const routes = await tx.$queryRaw<RouteRow[]>`
        SELECT route_key, source_key, version, enabled
        FROM public.inbound_email_sources
        WHERE organization_id = ${org}::uuid
        ORDER BY route_key
      `;
      const result: InboundSourceMetadata[] = [];
      for (const route of routes) {
        result.push(await this.readOne(tx, org, route.source_key, route.route_key));
      }
      return result;
    });
  }
}
