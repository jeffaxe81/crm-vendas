import { Inject, Injectable } from "@nestjs/common";
import {
  EMAIL_PROVIDER,
  EmailProviderUnavailableError,
  EmailDeliveryUnknownError,
  type EmailProvider,
  type TransactionalEmail,
} from "./email-provider";

export type EmailFailureCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "DELIVERY_UNKNOWN";

export type EmailSendOutcome =
  | Readonly<{ status: "ACCEPTED"; providerMessageId: string }>
  | Readonly<{ status: "FAILED"; errorCode: EmailFailureCode }>;

/**
 * Operational sends are best effort and never throw into the caller's
 * business transaction. A later microdelivery will invoke this service
 * from a post-commit, retryable email outbox worker.
 */
@Injectable()
export class EmailDispatchService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider
  ) {}

  async attempt(email: TransactionalEmail): Promise<EmailSendOutcome> {
    try {
      const result = await this.provider.send(email);
      if (
        !result ||
        typeof result.providerMessageId !== "string" ||
        result.providerMessageId.trim().length === 0
      ) {
        return { status: "FAILED", errorCode: "PROVIDER_ERROR" };
      }
      return {
        status: "ACCEPTED",
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      return {
        status: "FAILED",
        errorCode:
          error instanceof EmailProviderUnavailableError
            ? "PROVIDER_NOT_CONFIGURED"
            : error instanceof EmailDeliveryUnknownError
              ? "DELIVERY_UNKNOWN"
              : "PROVIDER_ERROR",
      };
    }
  }
}
