import { Module } from "@nestjs/common";
import { FirstAccessService } from "./first-access.service";
import { FirstAccessController } from "./first-access.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { WorkspacePreferencesController } from "./workspace-preferences.controller";
import { WorkspacePreferencesService } from "./workspace-preferences.service";
@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [WorkspacePreferencesController, FirstAccessController],
  providers: [WorkspacePreferencesService, FirstAccessService],
})
export class WorkspaceModule {}
