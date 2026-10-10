-- F4.3-02B2B: ambiguous remote acceptance must never be retried blindly.
-- Preserve all existing queue statuses and add an explicit terminal
-- quarantine state for operator reconciliation (no automatic dispatch).
ALTER TABLE public.email_outbox
  DROP CONSTRAINT email_outbox_status_check;
ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_status_check
  CHECK (status IN (
    'PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'ACCEPTED',
    'EXHAUSTED', 'CANCELLED', 'MANUAL_REVIEW'
  ));
