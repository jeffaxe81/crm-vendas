import type { MembershipRole } from "@axes/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHmac, randomBytes } from "node:crypto";

import { parseApiEnvironment } from "../config/environment";

export type AccessTokenPayload = {
  sub: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  sessionId: string;
};

@Injectable()
export class TokenService {
  private readonly environment = parseApiEnvironment(process.env);

  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  get accessTokenExpiresIn(): number {
    return this.environment.AUTH_ACCESS_TTL_SECONDS;
  }

  get refreshTokenExpiresIn(): number {
    return this.environment.AUTH_REFRESH_TTL_SECONDS;
  }

  createRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.environment.REFRESH_TOKEN_PEPPER)
      .update(token)
      .digest("hex");
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.environment.JWT_ACCESS_SECRET,
      algorithm: "HS256",
      expiresIn: this.environment.AUTH_ACCESS_TTL_SECONDS,
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.environment.JWT_ACCESS_SECRET,
      algorithms: ["HS256"],
    });
  }
}
