import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { AuditAdminController } from "./audit-admin.controller";
import { AuditModule } from "./audit.module";

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [AuditAdminController],
})
export class AuditAdminModule {}
