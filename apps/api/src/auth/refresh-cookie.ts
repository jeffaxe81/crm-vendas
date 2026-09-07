import { parseApiEnvironment } from "../config/environment";

export const REFRESH_COOKIE_NAME = "axes_refresh_token";

export function readRefreshToken(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === REFRESH_COOKIE_NAME) {
      const value = rawValue.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function createRefreshCookie(token: string): string {
  const environment = parseApiEnvironment(process.env);
  const attributes = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${environment.AUTH_REFRESH_TTL_SECONDS}`,
    "Path=/api/v1/auth",
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (environment.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function clearRefreshCookie(): string {
  const environment = parseApiEnvironment(process.env);
  const attributes = [
    `${REFRESH_COOKIE_NAME}=`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Path=/api/v1/auth",
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (environment.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}
