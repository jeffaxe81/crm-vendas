import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { EmailOutboxWorker } from "./email-outbox.worker";
import { EmailDispatchService } from "./email-dispatch.service";
import { DisabledEmailProvider, EMAIL_PROVIDER } from "./email-provider";

/**
 * F4.3-01 registers the contract without enabling outbound traffic.
 * Future provider configuration replaces this fail-closed binding.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    EmailOutboxWorker,
    EmailDispatchService,
    { provide: EMAIL_PROVIDER, useClass: DisabledEmailProvider },
  ],
  exports: [EmailDispatchService, EmailOutboxWorker],
})
export class EmailModule {}
