import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AuthenticationGuard } from "./authentication.guard";
import { PermissionsGuard } from "./permissions.guard";

@Module({
  imports: [AuthModule, DatabaseModule],
  providers: [AuthenticationGuard, PermissionsGuard],
  exports: [AuthenticationGuard, PermissionsGuard],
})
export class AuthorizationModule {}
