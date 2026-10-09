import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/** Fail closed for special-use, documentation, multicast and transition ranges. */
export function isPublicWebhookAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) !== 6 || address.includes(".")) return false;
  const halves = address.toLowerCase().split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const groups =
    halves.length === 1
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  const first = parseInt(groups[0] ?? "0", 16);
  const second = parseInt(groups[1] ?? "0", 16);
  // Only global unicast; mapped, NAT64, ULA, link-local and multicast cannot pass.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && (second < 0x0200 || second === 0x0db8)) return false;
  if (first === 0x2002 || (first === 0x3fff && second < 0x1000)) return false;
  return true;
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
    return !isPublicWebhookAddress(normalized);
  }
  if (version === 6) {
    return !isPublicWebhookAddress(normalized);
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

  if (
    parsed.port ||
    targetUrl.includes("?") ||
    targetUrl.includes("#") ||
    targetUrl !== targetUrl.trim()
  ) {
    throw new Error(
      "Webhook target must use port 443 without query or fragment."
    );
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
