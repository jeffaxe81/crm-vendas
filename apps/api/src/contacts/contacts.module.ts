import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
