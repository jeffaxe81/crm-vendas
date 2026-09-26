import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { ContactCsvParser } from "./contact-csv-parser";
import { ContactImportController } from "./contact-import.controller";
import { ContactImportService } from "./contact-import.service";

@Module({
  imports: [AuthorizationModule, CompaniesModule, ContactsModule],
  controllers: [ContactImportController],
  providers: [ContactCsvParser, ContactImportService],
})
export class ContactImportModule {}
