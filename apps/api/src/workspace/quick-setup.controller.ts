import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { QuickSetupService } from "./quick-setup.service";

@Controller("me/quick-setup")
@UseGuards(AuthenticationGuard)
export class QuickSetupController {
  constructor(
    @Inject(QuickSetupService)
    private readonly quickSetup: QuickSetupService
  ) {}

  @Get()
  read(@Req() request: AuthenticatedRequest) {
    return this.quickSetup.read(this.principal(request));
  }

  @Post("progress")
  progress(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.quickSetup.progress(body, this.context(request));
  }

  @Post("reopen")
  reopen(@Req() request: AuthenticatedRequest) {
    return this.quickSetup.reopen(this.context(request));
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.auth) {
      throw new UnauthorizedException();
    }
    return request.auth;
  }

  private context(request: AuthenticatedRequest) {
    return {
      principal: this.principal(request),
      requestId: request.requestId ?? "quick-setup",
      ipAddress: request.ip,
    };
  }
}
