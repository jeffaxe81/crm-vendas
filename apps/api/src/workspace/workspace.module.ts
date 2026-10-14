import { Module } from "@nestjs/common";
import { FirstAccessService } from "./first-access.service";
import { FirstAccessController } from "./first-access.controller";
import { QuickSetupController } from "./quick-setup.controller";
import { QuickSetupService } from "./quick-setup.service";
import { DatabaseModule } from "../database/database.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { WorkspacePreferencesController } from "./workspace-preferences.controller";
import { WorkspacePreferencesService } from "./workspace-preferences.service";
@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [
    WorkspacePreferencesController,
    FirstAccessController,
    QuickSetupController,
  ],
  providers: [
    WorkspacePreferencesService,
    FirstAccessService,
    QuickSetupService,
  ],
})
export class WorkspaceModule {}
