import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { IntegrationCredentialsController } from "./integration-credentials.controller";
import { IntegrationCredentialsService } from "./integration-credentials.service";

@Module({
  imports: [DatabaseModule, AuditModule, AuthorizationModule],
  controllers: [IntegrationCredentialsController],
  providers: [IntegrationCredentialsService],
  exports: [IntegrationCredentialsService],
})
export class IntegrationsModule {}
