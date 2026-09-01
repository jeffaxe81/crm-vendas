import {
  CreateOrganizationUserInputSchema,
  UpdateOrganizationMembershipInputSchema,
  type CreateOrganizationUserInput,
  type UpdateOrganizationMembershipInput,
} from "@axes/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AuthenticationGuard } from "../authorization/authentication.guard";
import type { AuthenticatedRequest } from "../authorization/authenticated-request";
import { PermissionsGuard } from "../authorization/permissions.guard";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import type { RequestWithId } from "../observability/request-id.middleware";
import { OrganizationUsersService } from "./organization-users.service";

type AdministrationRequest = AuthenticatedRequest & RequestWithId;

@Controller("admin/users")
@UseGuards(AuthenticationGuard, PermissionsGuard)
@RequirePermissions("user.manage")
export class OrganizationUsersController {
  constructor(
    @Inject(OrganizationUsersService)
    private readonly users: OrganizationUsersService
  ) {}

  @Get()
  list(@Req() request: AdministrationRequest) {
    return this.users.list(this.requirePrincipal(request).organizationId);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: AdministrationRequest) {
    return this.users.create(
      this.parseCreate(body),
      this.contextFrom(request)
    );
  }

  @Patch(":membershipId")
  update(
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Req() request: AdministrationRequest
  ) {
    return this.users.updateMembership(
      membershipId,
      this.parseUpdate(body),
      this.contextFrom(request)
    );
  }

  private parseCreate(body: unknown): CreateOrganizationUserInput {
    const parsed = CreateOrganizationUserInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private parseUpdate(body: unknown): UpdateOrganizationMembershipInput {
    const parsed = UpdateOrganizationMembershipInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map(issue => issue.message),
      });
    }
    return parsed.data;
  }

  private requirePrincipal(request: AdministrationRequest) {
    if (!request.auth) {
      throw new Error("Authenticated principal unavailable after guard.");
    }
    return request.auth;
  }

  private contextFrom(request: AdministrationRequest) {
    const principal = this.requirePrincipal(request);
    return {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId: request.requestId ?? "request-id-unavailable",
      ipAddress: request.ip,
    };
  }
}
