import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthenticationGuard } from "../authorization/authentication.guard";
import { SuperuserGuard } from "../authorization/superuser.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { RecoveryExecutionService } from "./recovery-execution.service";

@Controller("admin/recovery")
@UseGuards(AuthenticationGuard, SuperuserGuard)
export class RecoveryExecutionController {
  constructor(
    @Inject(RecoveryExecutionService)
    private readonly recovery: RecoveryExecutionService
  ) {}
  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  }
  @Get("capabilities")
  @Header("Cache-Control", "no-store")
  capabilities() {
    return this.recovery.capabilities();
  }
  @Get("operations")
  @Header("Cache-Control", "no-store")
  operations(@Req() request: AuthenticatedRequest) {
    return this.recovery.operations(this.principal(request));
  }
  @Post("delete/preview")
  @Header("Cache-Control", "no-store")
  preview(@Req() request: AuthenticatedRequest) {
    return this.recovery.previewDeletion(this.principal(request));
  }
  @Post("restore")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  restore(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.recovery.execute(this.principal(request), "RESTORE", body);
  }
  @Post("delete")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  delete(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.recovery.execute(this.principal(request), "DELETE", body);
  }
}
