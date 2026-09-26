import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { TerritoriesController } from "./territories.controller";
import { TerritoriesService } from "./territories.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [TerritoriesController],
  providers: [TerritoriesService],
  exports: [TerritoriesService],
})
export class TerritoriesModule {}
