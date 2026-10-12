import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { FirstAccessService } from "./first-access.service";

@Controller("me/onboarding")
@UseGuards(AuthenticationGuard)
export class FirstAccessController {
  constructor(
    @Inject(FirstAccessService) private readonly service: FirstAccessService
  ) {}
  private principal(request: AuthenticatedRequest) {
    if (!request.auth) throw new UnauthorizedException();
    return request.auth;
  }
  @Get()
  read(@Req() request: AuthenticatedRequest) {
    return this.service.read(this.principal(request));
  }
  @Put("organization")
  saveOrganization(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.service.saveOrganization(
      body,
      this.principal(request),
      request.requestId ?? "onboarding"
    );
  }
  @Post("tour")
  finishTour(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.service.finishTour(
      body,
      this.principal(request),
      request.requestId ?? "onboarding"
    );
  }
}
