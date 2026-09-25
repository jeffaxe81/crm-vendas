import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ManagementSummaryService } from "./management-summary.service";
import { SalesByProductService } from "./sales-by-product.service";
import { ReportsController } from "./reports.controller";
import {
  ACTIVITIES_BY_OWNER_CLOCK,
  ActivitiesByOwnerService,
  systemReportClock,
} from "./activities-by-owner.service";

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [
    ManagementSummaryService,
    SalesByProductService,
    ActivitiesByOwnerService,
    { provide: ACTIVITIES_BY_OWNER_CLOCK, useValue: systemReportClock },
  ],
  exports: [ManagementSummaryService, SalesByProductService],
})
export class ReportsModule {}
