import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { WorkspacePreferencesController } from "./workspace-preferences.controller";
import { WorkspacePreferencesService } from "./workspace-preferences.service";
@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [WorkspacePreferencesController],
  providers: [WorkspacePreferencesService],
})
export class WorkspaceModule {}
