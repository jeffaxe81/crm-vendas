import { createHmac } from "node:crypto";
import {
  InboundSourceVerifier,
  type InboundSourceBinding,
  type SignedInboundEnvelope,
} from "./inbound-source-verifier";

const nowMs = Date.UTC(2026, 9, 11, 12, 0, 0);
const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";
const keyA = Buffer.alloc(32, 19);
const keyB = Buffer.alloc(32, 23);

const a: InboundSourceBinding = {
  routeKey: "relay-a",
  sourceKey: "approved-relay-a",
  organizationId: orgA,
  keyId: "kid-a",
  secret: keyA,
  enabled: true,
};
const b: InboundSourceBinding = {
  routeKey: "relay-b",
  sourceKey: "approved-relay-b",
  organizationId: orgB,
  keyId: "kid-b",
  secret: keyB,
  enabled: true,
};

function sign(
  config: InboundSourceBinding,
  rawBody: Uint8Array = Buffer.from('{"hello":"inbound"}'),
  timestamp = String(Math.floor(nowMs / 1000))
): SignedInboundEnvelope {
  const digest = createHmac("sha256", config.secret)
    .update("crm-vendas.email.inbound.v1\n", "utf8")
    .update(timestamp, "utf8")
    .update("\n", "utf8")
    .update(config.routeKey, "utf8")
    .update("\n", "utf8")
    .update(config.keyId, "utf8")
    .update("\n", "utf8")
    .update(rawBody)
    .digest("hex");
  return {
    routeKey: config.routeKey,
    keyId: config.keyId,
    timestamp,
    signature: `v1=${digest}`,
    rawBody,
  };
}

describe("F4.3-03B1 offline inbound source signature and tenant boundary", () => {
  const verifier = () => new InboundSourceVerifier([a, b], () => nowMs);

  it("resolves organization exclusively from a matching trusted binding", () => {
    expect(verifier().verify(sign(a))).toEqual({
      organizationId: orgA,
      sourceKey: "approved-relay-a",
    });
    expect(verifier().verify(sign(b))).toEqual({
      organizationId: orgB,
      sourceKey: "approved-relay-b",
    });
  });

  it("ignores forged tenant identity inside an authenticated message", () => {
    const body = Buffer.from(
      JSON.stringify({
        organizationId: orgB,
        sourceKey: "approved-relay-b",
        routeKey: "relay-b",
        text: "not authorization data",
      })
    );
    expect(verifier().verify(sign(a, body))).toEqual({
      organizationId: orgA,
      sourceKey: a.sourceKey,
    });
  });

  it("rejects message, route, key, timestamp and signature tampering", () => {
    const signed = sign(a);
    const invalid: SignedInboundEnvelope[] = [
      { ...signed, rawBody: Buffer.from('{"hello":"altered"}') },
      { ...signed, routeKey: b.routeKey },
      { ...signed, keyId: b.keyId },
      { ...signed, timestamp: String(Number(signed.timestamp) + 1) },
      { ...signed, signature: "v1=" + "0".repeat(64) },
      { ...signed, signature: signed.signature.toUpperCase() },
      { ...signed, signature: "v2=" + signed.signature.slice(3) },
    ];
    for (const item of invalid) {
      expect(() => verifier().verify(item)).toThrow(
        "INBOUND_SOURCE_UNAUTHORIZED"
      );
    }
  });

  it("rejects unsigned input, invalid header fields, and oversized bodies", () => {
    const signed = sign(a);
    const invalid: SignedInboundEnvelope[] = [
      { ...signed, rawBody: Buffer.alloc(0) },
      { ...signed, rawBody: Buffer.alloc(256 * 1024 + 1) },
      { ...signed, keyId: "unknown" },
      { ...signed, routeKey: "unknown" },
      { ...signed, routeKey: "../other" },
      { ...signed, timestamp: "001234567890" },
      { ...signed, signature: "v1=xyz" },
    ];
    for (const item of invalid) {
      expect(() => verifier().verify(item)).toThrow(
        "INBOUND_SOURCE_UNAUTHORIZED"
      );
    }
    expect(() => new InboundSourceVerifier([], () => nowMs).verify(signed))
      .toThrow("INBOUND_SOURCE_UNAUTHORIZED");
  });

  it("enforces the signed time window in both directions", () => {
    const nowSeconds = Math.floor(nowMs / 1000);
    const fixed = verifier();
    expect(fixed.verify(sign(a, undefined, String(nowSeconds - 300)))).toEqual({
      organizationId: orgA,
      sourceKey: a.sourceKey,
    });
    expect(fixed.verify(sign(a, undefined, String(nowSeconds + 300)))).toEqual({
      organizationId: orgA,
      sourceKey: a.sourceKey,
    });
    for (const time of [nowSeconds - 301, nowSeconds + 301]) {
      expect(() => fixed.verify(sign(a, undefined, String(time)))).toThrow(
        "INBOUND_SOURCE_UNAUTHORIZED"
      );
    }
  });

  it("fails closed on disabled bindings, weak secrets, and ambiguous routes", () => {
    const disabled = new InboundSourceVerifier(
      [{ ...a, enabled: false }],
      () => nowMs
    );
    expect(() => disabled.verify(sign(a))).toThrow(
      "INBOUND_SOURCE_UNAUTHORIZED"
    );
    expect(
      () => new InboundSourceVerifier([{ ...a, secret: Buffer.alloc(16) }])
    ).toThrow("INBOUND_SOURCE_CONFIGURATION_INVALID");
    expect(() => new InboundSourceVerifier([a, a])).toThrow(
      "INBOUND_SOURCE_CONFIGURATION_INVALID"
    );
    expect(
      () =>
        new InboundSourceVerifier([
          a,
          {
            ...a,
            organizationId: orgB,
            keyId: "another-key",
          },
        ])
    ).toThrow("INBOUND_SOURCE_CONFIGURATION_INVALID");
    expect(
      () => new InboundSourceVerifier([{ ...a, sourceKey: "https://evil" }])
    ).toThrow("INBOUND_SOURCE_CONFIGURATION_INVALID");
  });

  it("allows key rotation for the same tenant, never a tenant remapping", () => {
    const rotated: InboundSourceBinding = {
      ...a,
      keyId: "kid-new",
      secret: Buffer.alloc(32, 41),
    };
    const withRotation = new InboundSourceVerifier([a, rotated], () => nowMs);
    expect(withRotation.verify(sign(rotated))).toEqual({
      organizationId: orgA,
      sourceKey: a.sourceKey,
    });
    expect(withRotation.verify(sign(a))).toEqual({
      organizationId: orgA,
      sourceKey: a.sourceKey,
    });
  });

  it("copies secret bytes so mutating caller memory does not authorize input", () => {
    const mutable = Buffer.alloc(32, 77);
    const snapshot = Buffer.from(mutable);
    const configured: InboundSourceBinding = {
      ...a,
      secret: mutable,
    };
    const fixed = new InboundSourceVerifier([configured], () => nowMs);
    mutable.fill(1);
    expect(fixed.verify(sign({ ...configured, secret: snapshot }))).toEqual({
      organizationId: orgA,
      sourceKey: a.sourceKey,
    });
    expect(() => fixed.verify(sign(configured))).toThrow(
      "INBOUND_SOURCE_UNAUTHORIZED"
    );
  });

  it("does not claim replay prevention: same signed envelope verifies twice", () => {
    const fixed = verifier();
    const signed = sign(a);
    expect(fixed.verify(signed)).toEqual(fixed.verify(signed));
    // Durably reject replay in the FUTURE ingress transaction using the
    // tenant/source/external ID HMAC unique index and provider identifiers.
  });
});
