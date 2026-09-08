import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import {
  CompanyCustomFieldsController,
  ContactCustomFieldsController,
  CustomFieldsController,
} from "./custom-fields.controller";
import { CustomFieldsService } from "./custom-fields.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [
    CustomFieldsController,
    CompanyCustomFieldsController,
    ContactCustomFieldsController,
  ],
  providers: [CustomFieldsService],
})
export class CustomFieldsModule {}
