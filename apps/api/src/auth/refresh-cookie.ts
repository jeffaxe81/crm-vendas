import {
  parseCookie,
  stringifySetCookie,
  type SetCookie,
} from "cookie";

import { parseApiEnvironment } from "../config/environment";

export const REFRESH_COOKIE_NAME = "axes_refresh_token";

export function readRefreshToken(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  return parseCookie(cookieHeader)[REFRESH_COOKIE_NAME] ?? null;
}

export function createRefreshCookie(token: string): string {
  const environment = parseApiEnvironment(process.env);
  const options: SetCookie = {
    name: REFRESH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: environment.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: environment.AUTH_REFRESH_TTL_SECONDS,
  };

  return stringifySetCookie(options);
}

export function clearRefreshCookie(): string {
  const environment = parseApiEnvironment(process.env);
  return stringifySetCookie({
    name: REFRESH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: environment.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 0,
    expires: new Date(0),
  });
}
