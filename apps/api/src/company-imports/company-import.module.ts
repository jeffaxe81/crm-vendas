import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { CompaniesModule } from "../companies/companies.module";
import { CompanyCsvParser } from "./company-csv-parser";
import { CompanyImportController } from "./company-import.controller";
import { CompanyImportService } from "./company-import.service";

@Module({
  imports: [AuthorizationModule, CompaniesModule],
  controllers: [CompanyImportController],
  providers: [CompanyCsvParser, CompanyImportService],
})
export class CompanyImportModule {}
