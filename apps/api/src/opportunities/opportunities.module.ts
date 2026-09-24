import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityItemsController } from "./opportunity-items.controller";
import { OpportunityItemsService } from "./opportunity-items.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [OpportunitiesController, OpportunityItemsController],
  providers: [OpportunitiesService, OpportunityItemsService],
})
export class OpportunitiesModule {}
