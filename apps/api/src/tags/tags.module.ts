import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import {
  CompanyTagsController,
  ContactTagsController,
  TagsController,
} from "./tags.controller";
import { TagsService } from "./tags.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [TagsController, CompanyTagsController, ContactTagsController],
  providers: [TagsService],
})
export class TagsModule {}
