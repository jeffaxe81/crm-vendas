import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request, type RequestOptions } from "node:https";
import { isIP } from "node:net";
import {
  assertSafeWebhookTargetUrl,
  isPublicWebhookAddress,
} from "./webhook-security";

export const WEBHOOK_TRANSPORT = Symbol("WEBHOOK_TRANSPORT");
export type WebhookTransportResult = {
  responseStatus: number | null;
  errorCode: string | null;
};
export interface WebhookTransport {
  send(
    targetUrl: string,
    body: string,
    headers: Record<string, string>
  ): Promise<WebhookTransportResult>;
}
export type WebhookTransportDependencies = {
  resolve: (hostname: string) => Promise<LookupAddress[]>;
  request: (
    options: RequestOptions,
    callback: (response: IncomingMessage) => void
  ) => ClientRequest;
};
const defaults: WebhookTransportDependencies = {
  resolve: hostname => lookup(hostname, { all: true, verbatim: true }),
  request,
};
export class HttpsWebhookTransport implements WebhookTransport {
  constructor(
    private readonly dependencies: WebhookTransportDependencies = defaults
  ) {}

  async send(
    targetUrl: string,
    body: string,
    headers: Record<string, string>
  ): Promise<WebhookTransportResult> {
    try {
      assertSafeWebhookTargetUrl(targetUrl);
    } catch {
      return { responseStatus: null, errorCode: "INVALID_TARGET" };
    }
    const url = new URL(targetUrl);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    return new Promise(resolve => {
      let settled = false;
      let req: ClientRequest | undefined;
      const finish = (
        responseStatus: number | null,
        errorCode: string | null
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ responseStatus, errorCode });
      };
      // A single wall-clock deadline includes DNS, handshake and response headers.
      const timer = setTimeout(() => {
        finish(null, "TIMEOUT");
        req?.destroy();
      }, 5000);
      const resolveAddresses = isIP(hostname)
        ? Promise.resolve([{ address: hostname, family: isIP(hostname) }])
        : Promise.resolve().then(() => this.dependencies.resolve(hostname));
      void resolveAddresses.then(
        addresses => {
          if (settled) return;
          if (
            !addresses.length ||
            addresses.some(
              a =>
                a.family !== isIP(a.address) ||
                !isPublicWebhookAddress(a.address)
            )
          ) {
            finish(null, "SSRF_BLOCKED");
            return;
          }
          const pinned = addresses[0]!;
          try {
            req = this.dependencies.request(
              {
                protocol: "https:",
                hostname,
                servername: isIP(hostname) ? undefined : hostname,
                port: 443,
                path: url.pathname,
                method: "POST",
                agent: false,
                rejectUnauthorized: true,
                headers: {
                  ...headers,
                  Host: url.host,
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(body),
                },
                family: pinned.family,
                lookup: (_host, options, callback) => {
                  if (options.all) callback(null, [pinned]);
                  else callback(null, pinned.address, pinned.family);
                },
              },
              response => {
                const status = response.statusCode ?? null;
                finish(
                  status,
                  status === null
                    ? "NETWORK_ERROR"
                    : status >= 300 && status < 400
                      ? "REDIRECT_BLOCKED"
                      : status >= 200 && status < 300
                        ? null
                        : "HTTP_ERROR"
                );
                // Never consume, log or persist the recipient's response body.
                response.destroy();
              }
            );
            req.on("error", () => finish(null, "NETWORK_ERROR"));
            req.end(body);
          } catch {
            finish(null, "NETWORK_ERROR");
            req?.destroy();
          }
        },
        () => finish(null, "DNS_ERROR")
      );
    });
  }
}
