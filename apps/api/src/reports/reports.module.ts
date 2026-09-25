import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ManagementSummaryService } from "./management-summary.service";
import { SalesByProductService } from "./sales-by-product.service";
import { ReportsController } from "./reports.controller";
import { FunnelService } from "./funnel.service";

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [ManagementSummaryService, SalesByProductService, FunnelService],
  exports: [ManagementSummaryService, SalesByProductService, FunnelService],
})
export class ReportsModule {}
