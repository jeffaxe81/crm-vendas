import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { DeniedAccessLogger } from "../audit/denied-access.logger";
import type { AuthenticatedRequest } from "./authenticated-request";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permissions.decorator";
import { roleHasPermission, type Permission } from "./permissions";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DeniedAccessLogger)
    private readonly deniedAccessLogger: DeniedAccessLogger
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.auth;

    if (
      !principal ||
      !required.every(permission =>
        roleHasPermission(principal.role, permission)
      )
    ) {
      const error = new ForbiddenException({
        code: "ACCESS_DENIED",
        message: "Você não possui permissão para esta operação.",
      });

      await this.deniedAccessLogger.recordDeniedAccess(request, {
        status: error.getStatus(),
        message: error.message,
      });
      throw error;
    }

    return true;
  }
}
