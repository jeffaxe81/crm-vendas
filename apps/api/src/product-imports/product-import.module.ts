import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { ProductsModule } from "../products/products.module";
import { ProductCsvParser } from "./product-csv-parser";
import { ProductImportController } from "./product-import.controller";
import { ProductImportService } from "./product-import.service";

@Module({
  imports: [AuthorizationModule, ProductsModule],
  controllers: [ProductImportController],
  providers: [ProductCsvParser, ProductImportService],
})
export class ProductImportModule {}
