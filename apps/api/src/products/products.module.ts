import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
