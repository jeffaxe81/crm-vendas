import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ManagementSummaryService } from "./management-summary.service";
import { ReportsController } from "./reports.controller";

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [ManagementSummaryService],
  exports: [ManagementSummaryService],
})
export class ReportsModule {}
