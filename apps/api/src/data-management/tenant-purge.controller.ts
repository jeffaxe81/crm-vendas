import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import { SuperuserGuard } from "../authorization/superuser.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { TenantPurgeService } from "./tenant-purge.service";

@Controller("admin/purge")
@UseGuards(AuthenticationGuard, SuperuserGuard)
export class TenantPurgeController {
  constructor(
    @Inject(TenantPurgeService) private readonly purge: TenantPurgeService
  ) {}

  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  }

  @Get("policy")
  @Header("Cache-Control", "no-store")
  getPolicy(@Req() request: AuthenticatedRequest) {
    return this.purge.read(this.principal(request));
  }

  @Put("policy")
  @Header("Cache-Control", "no-store")
  savePolicy(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.purge.configure(
      this.principal(request),
      body,
      request.requestId ?? ""
    );
  }
}
