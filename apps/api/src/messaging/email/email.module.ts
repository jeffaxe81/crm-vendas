import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../authorization/authorization.module";
import { DatabaseModule } from "../../database/database.module";
import { EmailOutboxWorker } from "./email-outbox.worker";
import { EmailManualReviewController } from "./email-manual-review.controller";
import { EmailManualReviewService } from "./email-manual-review.service";
import { EmailRelaySettingsController } from "./email-relay-settings.controller";
import { EmailRelayReadinessController } from "./email-relay-readiness.controller";
import { EmailRelayEvidenceController } from "./email-relay-evidence.controller";
import { EmailRelayEvidenceService } from "./email-relay-evidence.service";
import { EmailRelayReadinessService } from "./email-relay-readiness.service";
import { EmailRelaySettingsService } from "./email-relay-settings.service";
import { SlaEmailPlanner } from "./sla-email-planner";
import { EmailDispatchService } from "./email-dispatch.service";
import { DisabledEmailProvider, EMAIL_PROVIDER } from "./email-provider";

/**
 * F4.3-01 registers the contract without enabling outbound traffic.
 * Future provider configuration replaces this fail-closed binding.
 */
@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [
    EmailManualReviewController,
    EmailRelaySettingsController,
    EmailRelayReadinessController,
    EmailRelayEvidenceController,
  ],
  providers: [
    EmailRelayReadinessService,
    EmailRelayEvidenceService,
    EmailRelaySettingsService,
    EmailManualReviewService,
    EmailOutboxWorker,
    SlaEmailPlanner,
    EmailDispatchService,
    { provide: EMAIL_PROVIDER, useClass: DisabledEmailProvider },
  ],
  exports: [EmailDispatchService, EmailOutboxWorker, SlaEmailPlanner],
})
export class EmailModule {}
