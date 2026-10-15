-- Preserve catalog metadata while an idempotent worker removes the object.
-- DELETED is reached only after unlink and the completion audit commit.
ALTER TABLE public.backups DROP CONSTRAINT backups_state_check;
ALTER TABLE public.backups ADD CONSTRAINT backups_state_check
  CHECK (state IN ('PENDING','RUNNING','COMPLETED','FAILED','DELETING','DELETED'));
