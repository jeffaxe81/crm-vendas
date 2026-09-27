import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { SlaPoliciesController } from "./sla-policies.controller";
import { SlaPoliciesService } from "./sla-policies.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [SlaPoliciesController],
  providers: [SlaPoliciesService],
  exports: [SlaPoliciesService],
})
export class SlaModule {}
