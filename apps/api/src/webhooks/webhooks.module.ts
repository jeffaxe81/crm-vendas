import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { DatabaseModule } from "../database/database.module";
import { HttpsWebhookTransport, WEBHOOK_TRANSPORT } from "./webhook-transport";
import { WebhooksController } from "./webhooks.controller";
import { WebhookWorker } from "./webhook-worker";
import { WebhookWorkerRuntime } from "./webhook-worker.runtime";
import { WebhooksService } from "./webhooks.service";
@Module({
  imports: [DatabaseModule, AuthorizationModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookWorker,
    {
      provide: WebhookWorkerRuntime,
      inject: [WebhookWorker],
      useFactory: (worker: WebhookWorker) => new WebhookWorkerRuntime(worker),
    },
    {
      provide: WEBHOOK_TRANSPORT,
      useFactory: () => new HttpsWebhookTransport(),
    },
  ],
  exports: [WebhooksService, WEBHOOK_TRANSPORT],
})
export class WebhooksModule {}
