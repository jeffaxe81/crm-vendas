import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ManagementSummaryService } from "./management-summary.service";
import { SalesByProductService } from "./sales-by-product.service";
import { ReportsController } from "./reports.controller";
import { SalesByProductOwnersService } from "./sales-by-product-owners.service";

@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [ReportsController],
  providers: [
    ManagementSummaryService,
    SalesByProductService,
    SalesByProductOwnersService,
  ],
  exports: [
    ManagementSummaryService,
    SalesByProductService,
    SalesByProductOwnersService,
  ],
})
export class ReportsModule {}
