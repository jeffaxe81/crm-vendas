import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { SLA_CLOCK, systemSlaClock } from "../sla/sla-clock";
import {
  PublicSatisfactionController,
  TicketSatisfactionController,
} from "./ticket-satisfaction.controller";
import { TicketSatisfactionService } from "./ticket-satisfaction.service";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [
    TicketsController,
    TicketSatisfactionController,
    PublicSatisfactionController,
  ],
  providers: [
    TicketsService,
    TicketSatisfactionService,
    { provide: SLA_CLOCK, useValue: systemSlaClock },
  ],
  exports: [TicketsService, TicketSatisfactionService],
})
export class TicketsModule {}
