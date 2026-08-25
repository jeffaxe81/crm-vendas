import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import type { User } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { ENV } from "./_core/env";

const ISSUER = "crm-vendas";
const AUDIENCE = "local-auth";
const SESSION_DURATION = "12h";

function sessionKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET não configurado para a sessão local.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createLocalSession(userId: number) {
  return new SignJWT({ type: "local" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(sessionKey());
}

export async function getLocalSessionUser(req: Request): Promise<User | null> {
  const token = parseCookie(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    if (payload.type !== "local" || !payload.sub || !/^\d+$/.test(payload.sub)) return null;
    return (await db.getActiveLocalUserById(Number(payload.sub))) ?? null;
  } catch {
    return null;
  }
}
