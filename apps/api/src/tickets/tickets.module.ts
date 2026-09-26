import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
