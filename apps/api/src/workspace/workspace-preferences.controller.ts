import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import type { WorkspacePreferences } from "@axes/contracts";
import { WorkspacePreferencesService } from "./workspace-preferences.service";
@Controller("me/workspace-preferences")
@UseGuards(AuthenticationGuard)
export class WorkspacePreferencesController {
  constructor(
    @Inject(WorkspacePreferencesService)
    private readonly service: WorkspacePreferencesService
  ) {}
  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  }
  @Get() read(@Req() request: AuthenticatedRequest) {
    return this.service.read(this.principal(request));
  }
  @Put() save(
    @Body() input: WorkspacePreferences,
    @Req() request: AuthenticatedRequest
  ) {
    return this.service.save(
      input,
      this.principal(request),
      request.requestId ?? "workspace"
    );
  }
}
