import type { ConfidentialClient } from "./email-oauth-confidential-exchange";
export type RefreshedEmailOAuthToken = Readonly<{
  accessToken: string;
  refreshToken?: string;
  revoked?: boolean;
}>;
/** Pinned confidential refresh. No retries, raw responses, or token logging. */
export class EmailOAuthRefresh {
  constructor(private readonly request: typeof fetch = fetch) {}
  async refresh(
    client: ConfidentialClient,
    refreshToken: string
  ): Promise<RefreshedEmailOAuthToken> {
    if (
      !/^[\x21-\x7e]{20,8192}$/.test(refreshToken) ||
      !/^[\x21-\x7e]{16,4096}$/.test(client.clientSecret)
    )
      throw Error("EMAIL_OAUTH_REFRESH_FAILED");
    let endpoint = "https://oauth2.googleapis.com/token";
    if (client.provider === "MICROSOFT_365") {
      if (!/^[0-9a-f-]{36}$/i.test(client.microsoftTenantId ?? ""))
        throw Error("EMAIL_OAUTH_REFRESH_FAILED");
      endpoint = `https://login.microsoftonline.com/${client.microsoftTenantId}/oauth2/v2.0/token`;
    } else if (client.provider !== "GMAIL")
      throw Error("EMAIL_OAUTH_REFRESH_FAILED");
    try {
      const response = await this.request(endpoint, {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.clientId,
          client_secret: client.clientSecret,
          refresh_token: refreshToken,
        }).toString(),
      });
      if (
        response.redirected ||
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? ""
        )
      )
        throw Error();
      if (!response.body) throw Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 65536) throw Error();
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const value = JSON.parse(Buffer.concat(chunks).toString()) as Record<
        string,
        unknown
      >;
      if (response.status === 400 && value.error === "invalid_grant")
        return { accessToken: "", revoked: true };
      if (
        response.status !== 200 ||
        value.token_type !== "Bearer" ||
        typeof value.access_token !== "string" ||
        !/^[\x21-\x7e]{20,32768}$/.test(value.access_token) ||
        !Number.isSafeInteger(value.expires_in) ||
        Number(value.expires_in) < 60 ||
        Number(value.expires_in) > 86400 ||
        (value.refresh_token !== undefined &&
          (typeof value.refresh_token !== "string" ||
            !/^[\x21-\x7e]{20,8192}$/.test(value.refresh_token)))
      )
        throw Error();
      return {
        accessToken: value.access_token,
        ...(value.refresh_token
          ? { refreshToken: value.refresh_token as string }
          : {}),
      };
    } catch {
      throw Error("EMAIL_OAUTH_REFRESH_FAILED");
    }
  }
}
