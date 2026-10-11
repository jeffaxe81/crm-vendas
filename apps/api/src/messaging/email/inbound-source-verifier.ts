import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Offline, proposed signature contract for a FUTURE trusted e-mail ingress.
 * This file is deliberately not registered in EmailModule and creates no route.
 */
export type InboundSourceBinding = Readonly<{
  /** Opaque routing alias resolved only against trusted configuration. */
  routeKey: string;
  /** Trusted metadata stored after verifying the signature. */
  sourceKey: string;
  organizationId: string;
  /** Allows secret rotation only within the SAME source and tenant. */
  keyId: string;
  /** Already loaded from a trusted secret store. Never log or persist here. */
  secret: Uint8Array;
  enabled: boolean;
}>;

export type SignedInboundEnvelope = Readonly<{
  routeKey: string;
  keyId: string;
  /** Decimal UNIX time, in seconds. This literal is covered by the HMAC. */
  timestamp: string;
  /** Lowercase, canonical `v1=<64 hex chars>`. */
  signature: string;
  /** Exact bytes received, before JSON decoding or any normalization. */
  rawBody: Uint8Array;
}>;

export type AuthenticatedInboundSource = Readonly<{
  organizationId: string;
  sourceKey: string;
}>;

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,47}$/;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SIGNATURE_PATTERN = /^v1=[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN = /^[1-9][0-9]{0,11}$/;

type TrustedBinding = Readonly<{
  organizationId: string;
  sourceKey: string;
  enabled: boolean;
  secret: Buffer;
}>;

const unauthorized = () => new Error("INBOUND_SOURCE_UNAUTHORIZED");
const invalidConfiguration = () =>
  new Error("INBOUND_SOURCE_CONFIGURATION_INVALID");

/** Canonical framing also authenticates routeKey/keyId, not only rawBody. */
function mac(
  secret: Uint8Array,
  timestamp: string,
  routeKey: string,
  keyId: string,
  body: Uint8Array
): Buffer {
  return createHmac("sha256", secret)
    .update("crm-vendas.email.inbound.v1\n", "utf8")
    .update(timestamp, "utf8")
    .update("\n", "utf8")
    .update(routeKey, "utf8")
    .update("\n", "utf8")
    .update(keyId, "utf8")
    .update("\n", "utf8")
    .update(body)
    .digest();
}

/**
 * A fail-closed boundary. The routing alias and key ID are UNTRUSTED inputs
 * until the exact raw body and framing have passed HMAC verification.
 * Never derive organizationId/sourceKey from a request body or URL parameter.
 */
export class InboundSourceVerifier {
  private readonly bindings = new Map<string, TrustedBinding>();

  constructor(
    bindings: readonly InboundSourceBinding[],
    private readonly nowMs: () => number = Date.now
  ) {
    const routeOwners = new Map<
      string,
      Readonly<{ organizationId: string; sourceKey: string }>
    >();

    for (const binding of bindings) {
      if (
        !SOURCE_KEY_PATTERN.test(binding.routeKey) ||
        !SOURCE_KEY_PATTERN.test(binding.sourceKey) ||
        !KEY_ID_PATTERN.test(binding.keyId) ||
        !UUID_PATTERN.test(binding.organizationId) ||
        typeof binding.enabled !== "boolean" ||
        !(binding.secret instanceof Uint8Array) ||
        binding.secret.byteLength < 32 ||
        binding.secret.byteLength > 128
      ) {
        throw invalidConfiguration();
      }
      const owner = routeOwners.get(binding.routeKey);
      if (
        owner &&
        (owner.organizationId !== binding.organizationId ||
          owner.sourceKey !== binding.sourceKey)
      ) {
        // A routing alias may rotate keys, never switch to another tenant.
        throw invalidConfiguration();
      }
      routeOwners.set(binding.routeKey, {
        organizationId: binding.organizationId,
        sourceKey: binding.sourceKey,
      });

      const id = `${binding.routeKey}:${binding.keyId}`;
      if (this.bindings.has(id)) throw invalidConfiguration();
      this.bindings.set(id, {
        organizationId: binding.organizationId,
        sourceKey: binding.sourceKey,
        enabled: binding.enabled,
        // Defensive copy: mutating the caller's array cannot rotate a key.
        secret: Buffer.from(binding.secret),
      });
    }
  }

  verify(envelope: SignedInboundEnvelope): AuthenticatedInboundSource {
    if (
      !envelope ||
      typeof envelope.routeKey !== "string" ||
      typeof envelope.keyId !== "string" ||
      typeof envelope.timestamp !== "string" ||
      typeof envelope.signature !== "string" ||
      !(envelope.rawBody instanceof Uint8Array) ||
      envelope.rawBody.byteLength === 0 ||
      envelope.rawBody.byteLength > MAX_BODY_BYTES ||
      !SOURCE_KEY_PATTERN.test(envelope.routeKey) ||
      !KEY_ID_PATTERN.test(envelope.keyId) ||
      !TIMESTAMP_PATTERN.test(envelope.timestamp) ||
      !SIGNATURE_PATTERN.test(envelope.signature)
    ) {
      throw unauthorized();
    }

    const seconds = Number(envelope.timestamp);
    const now = Math.floor(this.nowMs() / 1000);
    if (
      !Number.isSafeInteger(seconds) ||
      !Number.isSafeInteger(now) ||
      Math.abs(now - seconds) > MAX_CLOCK_SKEW_SECONDS
    ) {
      throw unauthorized();
    }

    const binding = this.bindings.get(`${envelope.routeKey}:${envelope.keyId}`);
    if (!binding || !binding.enabled) throw unauthorized();

    const computed = mac(
      binding.secret,
      envelope.timestamp,
      envelope.routeKey,
      envelope.keyId,
      // Copy before signing to avoid retaining caller-controlled buffers.
      Buffer.from(envelope.rawBody)
    );
    const supplied = Buffer.from(envelope.signature.slice(3), "hex");
    if (!timingSafeEqual(computed, supplied)) throw unauthorized();

    // Only trusted configuration can determine the tenant and source.
    return {
      organizationId: binding.organizationId,
      sourceKey: binding.sourceKey,
    };
  }
}
