import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Body,
  Req,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import { SuperuserGuard } from "../authorization/superuser.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { BackupAdministrationService } from "./backup-administration.service";
import { BackupDeletionService } from "./backup-deletion.service";

@Controller("admin/backups")
@UseGuards(AuthenticationGuard, SuperuserGuard)
export class BackupAdministrationController {
  constructor(
    @Inject(BackupAdministrationService)
    private readonly backups: BackupAdministrationService,
    @Inject(BackupDeletionService)
    private readonly deletions: BackupDeletionService
  ) {}

  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  }

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() request: AuthenticatedRequest) {
    return this.backups.list(this.principal(request));
  }

  @Get("operations")
  @Header("Cache-Control", "no-store")
  operations(@Req() request: AuthenticatedRequest) {
    return this.backups.operations(this.principal(request));
  }

  @Post()
  requestBackup(@Req() request: AuthenticatedRequest) {
    return this.backups.requestBackup(
      this.principal(request),
      request.requestId ?? ""
    );
  }

  @Get("schedule")
  @Header("Cache-Control", "no-store")
  getSchedule(@Req() request: AuthenticatedRequest) {
    return this.backups.getSchedule(this.principal(request));
  }

  @Put("schedule")
  saveSchedule(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.backups.saveSchedule(
      this.principal(request),
      body,
      request.requestId ?? ""
    );
  }

  @Post(":id/preview")
  preview(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.backups.previewRestore(this.principal(request), id);
  }

  @Delete(":id")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  deleteBackup(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    return this.deletions.requestDeletion(
      this.principal(request),
      id,
      body,
      request.requestId ?? ""
    );
  }

  @Get(":id/download")
  @Header("Cache-Control", "no-store")
  async download(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest
  ) {
    const bytes = await this.backups.download(
      this.principal(request),
      id,
      request.requestId ?? ""
    );
    return new StreamableFile(bytes, {
      type: "application/json",
      disposition: 'attachment; filename="crm-backup.json"',
    });
  }
}
