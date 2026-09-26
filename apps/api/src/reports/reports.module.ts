import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ManagementSummaryService } from "./management-summary.service";
import { SalesByProductService } from "./sales-by-product.service";
import { ReportsController } from "./reports.controller";
import { SalesByProductOwnersService } from "./sales-by-product-owners.service";
import { FunnelService } from "./funnel.service";
import {
  ACTIVITIES_BY_OWNER_CLOCK,
  ActivitiesByOwnerService,
  systemReportClock,
} from "./activities-by-owner.service";
import { CsatReportService } from "./csat.service";

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [
    ManagementSummaryService,
    SalesByProductService,
    SalesByProductOwnersService,
    FunnelService,
    ActivitiesByOwnerService,
    { provide: ACTIVITIES_BY_OWNER_CLOCK, useValue: systemReportClock },
    CsatReportService,
  ],
  exports: [
    ManagementSummaryService,
    SalesByProductService,
    SalesByProductOwnersService,
    FunnelService,
    ActivitiesByOwnerService,
    CsatReportService,
  ],
})
export class ReportsModule {}
