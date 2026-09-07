import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PasswordService } from "../auth/password.service";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { OrganizationUsersController } from "./organization-users.controller";
import { OrganizationUsersService } from "./organization-users.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [OrganizationUsersController],
  providers: [OrganizationUsersService, PasswordService],
})
export class OrganizationUsersModule {}
