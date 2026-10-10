import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { EmailOutboxWorker } from "./email-outbox.worker";
import { EmailManualReviewController } from "./email-manual-review.controller";
import { EmailManualReviewService } from "./email-manual-review.service";
import { SlaEmailPlanner } from "./sla-email-planner";
import { EmailDispatchService } from "./email-dispatch.service";
import { DisabledEmailProvider, EMAIL_PROVIDER } from "./email-provider";

/**
 * F4.3-01 registers the contract without enabling outbound traffic.
 * Future provider configuration replaces this fail-closed binding.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [EmailManualReviewController],
  providers: [
    EmailManualReviewService,
    EmailOutboxWorker,
    SlaEmailPlanner,
    EmailDispatchService,
    { provide: EMAIL_PROVIDER, useClass: DisabledEmailProvider },
  ],
  exports: [EmailDispatchService, EmailOutboxWorker, SlaEmailPlanner],
})
export class EmailModule {}
