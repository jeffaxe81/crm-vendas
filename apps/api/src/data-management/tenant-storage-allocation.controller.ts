import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import { SuperuserGuard } from "../authorization/superuser.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { TenantStorageAllocationService } from "./tenant-storage-allocation.service";
import { TenantStorageReconciliationService } from "./tenant-storage-reconciliation.service";

@Controller("admin/storage")
@UseGuards(AuthenticationGuard, SuperuserGuard)
export class TenantStorageAllocationController {
  constructor(
    @Inject(TenantStorageAllocationService)
    private readonly allocation: TenantStorageAllocationService,
    @Inject(TenantStorageReconciliationService)
    private readonly reconciliation: TenantStorageReconciliationService
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

  @Get("reconciliation")
  @Header("Cache-Control", "no-store")
  reconcile(
    @Req() request: AuthenticatedRequest,
    @Query("cursor") cursor?: string
  ) {
    return this.reconciliation.scan(this.principal(request), cursor);
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
