import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;

  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value))) {
    return true;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }

  const firstGroup = normalized.split(":")[0];
  if (/^fe[89ab]/.test(firstGroup)) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) === 4 ? isBlockedIpv4(mappedIpv4) : true;
  }

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) {
    return isBlockedIpv4(normalized);
  }
  if (version === 6) {
    return isBlockedIpv6(normalized);
  }

  return false;
}

export function assertSafeWebhookTargetUrl(targetUrl: string): void {
  let parsed: URL;

  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Webhook target URL is invalid.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Webhook target URL must use HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Webhook target URL must not contain credentials.");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Webhook target URL points to a blocked network.");
  }
}

export function signWebhookPayload(payload: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  payload: string,
  secret: string,
  signature: string
): boolean {
  const expected = signWebhookPayload(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
