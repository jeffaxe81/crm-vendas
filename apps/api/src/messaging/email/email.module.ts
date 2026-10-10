import { Module } from "@nestjs/common";
import { EmailDispatchService } from "./email-dispatch.service";
import { DisabledEmailProvider, EMAIL_PROVIDER } from "./email-provider";

/**
 * F4.3-01 registers the contract without enabling outbound traffic.
 * Future provider configuration replaces this fail-closed binding.
 */
@Module({
  providers: [
    EmailDispatchService,
    { provide: EMAIL_PROVIDER, useClass: DisabledEmailProvider },
  ],
  exports: [EmailDispatchService],
})
export class EmailModule {}
