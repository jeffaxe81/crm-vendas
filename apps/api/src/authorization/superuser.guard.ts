import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { DeniedAccessLogger } from "../audit/denied-access.logger";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class SuperuserGuard implements CanActivate {
  constructor(
    @Inject(DeniedAccessLogger) private readonly denied: DeniedAccessLogger
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      request.auth?.authMethod === "session" &&
      request.auth.isSuperuser === true
    )
      return true;
    await this.denied.recordDeniedAccess(request, {
      status: 403,
      message: "Superusuário necessário.",
    });
    throw new ForbiddenException({
      code: "SUPERUSER_REQUIRED",
      message: "Operação exclusiva do Superusuário.",
    });
  }
}
