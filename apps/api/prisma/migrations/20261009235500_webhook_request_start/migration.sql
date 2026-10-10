-- Separate a cancellable claim/DNS phase from an owned, started HTTP attempt.
ALTER TABLE public.webhook_dispatches
  ADD COLUMN request_started_at TIMESTAMPTZ(6);
