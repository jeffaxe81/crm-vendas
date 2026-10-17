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
import { TenantStorageAllocationService } from "./tenant-storage-allocation.service";

@Controller("admin/storage")
@UseGuards(AuthenticationGuard, SuperuserGuard)
export class TenantStorageAllocationController {
  constructor(
    @Inject(TenantStorageAllocationService)
    private readonly allocation: TenantStorageAllocationService
  ) {}

  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  }

  @Get("allocation")
  @Header("Cache-Control", "no-store")
  get(@Req() request: AuthenticatedRequest) {
    return this.allocation.read(this.principal(request));
  }

  @Put("allocation")
  @Header("Cache-Control", "no-store")
  put(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.allocation.configure(
      this.principal(request),
      body,
      request.requestId ?? ""
    );
  }
}
