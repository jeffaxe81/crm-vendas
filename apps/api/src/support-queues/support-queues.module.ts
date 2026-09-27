import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { SupportQueuesController } from "./support-queues.controller";
import { SupportQueuesService } from "./support-queues.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [SupportQueuesController],
  providers: [SupportQueuesService],
  exports: [SupportQueuesService],
})
export class SupportQueuesModule {}
