import {
  LoginInputSchema,
  type AuthSessionResponse,
  type LoginInput,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { RequestWithId } from "../observability/request-id.middleware";
import { AuthService } from "./auth.service";
import {
  clearRefreshCookie,
  createRefreshCookie,
  readRefreshToken,
} from "./refresh-cookie";

type RequestWithContext = Request & RequestWithId;

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthSessionResponse> {
    const input = this.parseLogin(body);
    const result = await this.auth.login(input, this.requestContext(request));

    response.setHeader("Set-Cookie", createRefreshCookie(result.refreshToken));
    return result.response;
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthSessionResponse> {
    const refreshToken = this.requireRefreshToken(request);
    const result = await this.auth.refresh(
      refreshToken,
      this.requestContext(request)
    );

    response.setHeader("Set-Cookie", createRefreshCookie(result.refreshToken));
    return result.response;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const refreshToken = readRefreshToken(request.headers.cookie);

    if (refreshToken) {
      await this.auth.logout(refreshToken, this.requestContext(request));
    }

    response.setHeader("Set-Cookie", clearRefreshCookie());
  }

  private parseLogin(body: unknown): LoginInput {
    const parsed = LoginInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }

    return parsed.data;
  }

  private requireRefreshToken(request: Request): string {
    const token = readRefreshToken(request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException({
        code: "SESSION_INVALID",
        message: "Sessão inválida ou expirada.",
      });
    }
    return token;
  }

  private requestContext(request: RequestWithContext) {
    return {
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
