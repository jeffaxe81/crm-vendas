import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AuthenticationGuard } from "./authentication.guard";
import { PermissionsGuard } from "./permissions.guard";
import { SessionController } from "./session.controller";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [SessionController],
  providers: [AuthenticationGuard, PermissionsGuard],
  exports: [AuthModule, DatabaseModule, AuthenticationGuard, PermissionsGuard],
})
export class AuthorizationModule {}
