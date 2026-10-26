import { PrismaService } from "../../database/prisma.service";
import { EmailOAuthRuntimeService } from "./email-oauth-runtime.service";
import { EmailOAuthController } from "./email-oauth.controller";
import { EmailOAuthSendProvider } from "./email-oauth-send.provider";
import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../authorization/authorization.module";
import { DatabaseModule } from "../../database/database.module";
import { EmailOutboxWorker } from "./email-outbox.worker";
import { EmailManualReviewController } from "./email-manual-review.controller";
import { EmailManualReviewService } from "./email-manual-review.service";
import { EmailRelaySettingsController } from "./email-relay-settings.controller";
import { EmailProviderPreferenceController } from "./email-provider-preference.controller";
import { EmailProviderPreferenceService } from "./email-provider-preference.service";
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
    EmailOAuthController,
    EmailManualReviewController,
    EmailRelaySettingsController,
    EmailProviderPreferenceController,
    EmailRelayReadinessController,
    EmailRelayEvidenceController,
  ],
  providers: [
    EmailRelayReadinessService,
    EmailRelayEvidenceService,
    EmailRelaySettingsService,
    EmailProviderPreferenceService,
    EmailManualReviewService,
    EmailOutboxWorker,
    SlaEmailPlanner,
    EmailDispatchService,
    {
      provide: EmailOAuthRuntimeService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new EmailOAuthRuntimeService(prisma),
    },
    {
      provide: EMAIL_PROVIDER,
      inject: [EmailOAuthRuntimeService],
      useFactory: (runtime: EmailOAuthRuntimeService) => {
        if (process.env.EMAIL_OAUTH_SEND_ENABLED !== "true")
          return new DisabledEmailProvider();
        const recipients = new Map<string, ReadonlySet<string>>();
        try {
          const raw =
            process.env.EMAIL_OAUTH_HOMOLOGATION_RECIPIENTS_JSON ?? "{}";
          if (raw.length > 65536) throw Error();
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw Error();
          for (const [organizationId, values] of Object.entries(parsed)) {
            if (
              !Array.isArray(values) ||
              values.some(value => typeof value !== "string")
            )
              throw Error();
            recipients.set(
              organizationId,
              new Set((values as string[]).map(value => value.toLowerCase()))
            );
          }
        } catch {
          return new DisabledEmailProvider();
        }
        return new EmailOAuthSendProvider(runtime, {
          enabled: true,
          homologationRecipients: recipients,
        });
      },
    },
  ],
  exports: [EmailDispatchService, EmailOutboxWorker, SlaEmailPlanner],
})
export class EmailModule {}
