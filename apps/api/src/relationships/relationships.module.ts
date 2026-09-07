import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import {
  CompanyContactRelationshipsController,
  RelationshipEntriesController,
} from "./relationships.controller";
import { RelationshipsService } from "./relationships.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [
    CompanyContactRelationshipsController,
    RelationshipEntriesController,
  ],
  providers: [RelationshipsService],
})
export class RelationshipsModule {}
