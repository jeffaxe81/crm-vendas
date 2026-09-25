import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ManagementSummaryService } from "./management-summary.service";
import { SalesByOwnerService } from "./sales-by-owner.service";
import { SalesByProductService } from "./sales-by-product.service";
import { ReportsController } from "./reports.controller";

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [
    ManagementSummaryService,
    SalesByProductService,
    SalesByOwnerService,
  ],
  exports: [
    ManagementSummaryService,
    SalesByProductService,
    SalesByOwnerService,
  ],
})
export class ReportsModule {}
