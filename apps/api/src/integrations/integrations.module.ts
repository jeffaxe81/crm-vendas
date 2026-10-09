import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { NeoCommunicationSettingsController } from "./neo-communication-settings.controller";
import { IntegrationCredentialsController } from "./integration-credentials.controller";
import { IntegrationCredentialsService } from "./integration-credentials.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [
    IntegrationCredentialsController,
    NeoCommunicationSettingsController,
  ],
  providers: [IntegrationCredentialsService],
  exports: [IntegrationCredentialsService],
})
export class IntegrationsModule {}
