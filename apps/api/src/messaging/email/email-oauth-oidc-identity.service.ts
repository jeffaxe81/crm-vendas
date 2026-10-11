import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";
import {
  verifyOfflineOidcIdToken,
  type VerifiedOidcIdentity,
} from "./email-oauth-id-token-verifier";
import type { EmailOAuthPinnedJwksReader } from "./email-oauth-pinned-jwks-reader";

/**
 * These values must come from a server-owned OAuth client registration and
 * the tenant/session-bound, one-use pending grant after callback checks.
 * Never build this object from the JWT, browser or callback query.
 */
export type TrustedOidcCallbackContext = Readonly<{
  provider: EmailOAuthProvider;
  clientId: string;
  oidcNonce: string;
  microsoftTenantId?: string;
}>;

/**
 * F4.3-05B4 offline composition. The only network operation is the reader's
 * fixed provider JWKS endpoint. No token exchange, persistence or e-mail send.
 */
export class EmailOAuthOidcIdentityService {
  constructor(
    private readonly keys: Pick<EmailOAuthPinnedJwksReader, "getTrustedKeys">,
    private readonly clockSeconds: () => number = () =>
      Math.floor(Date.now() / 1000)
  ) {}

  async verify(
    idToken: string,
    trustedContext: TrustedOidcCallbackContext
  ): Promise<VerifiedOidcIdentity> {
    try {
      // Reject malformed/oversized input before any JWKS lookup.
      if (
        typeof idToken !== "string" ||
        idToken.length === 0 ||
        idToken.length > 16384 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken) ||
        !trustedContext ||
        !["GMAIL", "MICROSOFT_365"].includes(trustedContext.provider)
      ) {
        throw Error("INVALID_OIDC_INPUT");
      }
      const trustedKeys = await this.keys.getTrustedKeys({
        provider: trustedContext.provider,
        microsoftTenantId: trustedContext.microsoftTenantId,
      });

      // No fallback to stale keys, browser-supplied jwk/jku/x5u or unknown
      // issuers. Key rotation follows the pinned reader TTL/explicit refresh.
      return verifyOfflineOidcIdToken(idToken, {
        provider: trustedContext.provider,
        clientId: trustedContext.clientId,
        oidcNonce: trustedContext.oidcNonce,
        microsoftTenantId: trustedContext.microsoftTenantId,
        trustedKeys,
        nowSeconds: this.clockSeconds(),
      });
    } catch {
      // Intentionally reveal no raw JWT, claims, provider response or key IDs.
      throw new Error("EMAIL_OAUTH_IDENTITY_VERIFICATION_FAILED");
    }
  }
}
