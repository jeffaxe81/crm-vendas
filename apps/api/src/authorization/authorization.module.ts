import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AuthenticationGuard } from "./authentication.guard";
import { PermissionsGuard } from "./permissions.guard";
import { SessionController } from "./session.controller";
import { SuperuserGuard } from "./superuser.guard";

@Module({
  imports: [AuthModule, AuditModule, DatabaseModule],
  controllers: [SessionController],
  providers: [AuthenticationGuard, PermissionsGuard, SuperuserGuard],
  exports: [
    AuthModule,
    AuditModule,
    DatabaseModule,
    AuthenticationGuard,
    PermissionsGuard,
    SuperuserGuard,
  ],
})
export class AuthorizationModule {}
