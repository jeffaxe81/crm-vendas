import type { Prisma } from "../../generated/prisma/client";
import type { TransactionalEmail } from "./email-provider";
import {
  emailIdempotencyHash,
  emailOutboxKey,
  encryptOutboxEmail,
} from "./email-outbox-crypto";

/**
 * Called inside an already-open domain transaction. A rollback cancels both
 * the domain mutation and notification. Unique (tenant, idempotency hash)
 * ensures that replaying the same event does not duplicate queued email.
 */
export async function enqueueTransactionalEmail(
  tenant: Prisma.TransactionClient,
  email: TransactionalEmail,
  key: string | undefined = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY
): Promise<boolean> {
  const encryptionKey = emailOutboxKey(key);
  const idempotencyHash = emailIdempotencyHash(email.idempotencyKey);
  const encryptedEmail = encryptOutboxEmail(
    email,
    encryptionKey,
    idempotencyHash
  );
  const result = await tenant.emailOutbox.createMany({
    skipDuplicates: true,
    data: [
      {
        organizationId: email.organizationId,
        ticketId: email.referenceId,
        idempotencyHash,
        encryptedEmail,
        purpose: email.purpose,
      },
    ],
  });
  return result.count === 1;
}
