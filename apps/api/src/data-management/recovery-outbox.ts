import type { Prisma } from "../generated/prisma/client";

/** Preserve ciphertext and idempotency, but never send pre-recovery pending messages blindly. */
export async function pauseOutboxAfterRecovery(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  await tx.emailOutbox.updateMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "RETRY_SCHEDULED", "PROCESSING"] },
    },
    data: {
      status: "MANUAL_REVIEW",
      nextAttemptAt: null,
      leaseToken: null,
      leasedUntil: null,
      lastErrorCode: "RECOVERY_REVIEW_REQUIRED",
    },
  });
}
