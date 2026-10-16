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
import { TenantBrandingService } from "./tenant-branding.service";

@Controller("organization/branding")
@UseGuards(AuthenticationGuard)
export class TenantBrandingController {
  constructor(
    @Inject(TenantBrandingService)
    private readonly service: TenantBrandingService
  ) {}
  private actor(req: AuthenticatedRequest) {
    if (!req.auth) throw new UnauthorizedException();
    return req.auth;
  }
  @Get() read(@Req() req: AuthenticatedRequest) {
    return this.service.read(this.actor(req));
  }
  @Put() save(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.save(
      body,
      this.actor(req),
      req.requestId ?? "branding"
    );
  }
}
