import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "./authenticated-request";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permissions.decorator";
import { roleHasPermission, type Permission } from "./permissions";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
      throw new ForbiddenException({
        code: "ACCESS_DENIED",
        message: "Você não possui permissão para esta operação.",
      });
    }

    return true;
  }
}
