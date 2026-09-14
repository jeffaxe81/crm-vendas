import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AuditService } from "./audit.service";
import { DeniedAccessLogger } from "./denied-access.logger";

@Module({
  imports: [DatabaseModule],
  providers: [AuditService, DeniedAccessLogger],
  exports: [AuditService, DeniedAccessLogger],
})
export class AuditModule {}
