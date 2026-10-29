import { isIP } from "node:net";
/** Local HTTP is opt-in and pinned to the exact deployment-owned origin. */
export function validEmailOAuthOrigin(
  raw: string,
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  try {
    const url = new URL(raw);
    if (
      url.origin !== raw ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return false;
    if (
      url.protocol === "https:" &&
      !url.port &&
      isIP(url.hostname) === 0 &&
      url.hostname.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        url.hostname
      )
    )
      return true;
    return (
      environment.EMAIL_OAUTH_ALLOW_LOOPBACK === "true" &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      environment.EMAIL_OAUTH_CALLBACK_ORIGIN === raw
    );
  } catch {
    return false;
  }
}
export function validEmailOAuthRedirect(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      raw === url.toString() &&
      !url.username &&
      !url.password &&
      url.pathname === "/admin/email/oauth/callback" &&
      !url.search &&
      !url.hash &&
      validEmailOAuthOrigin(url.origin)
    );
  } catch {
    return false;
  }
}
