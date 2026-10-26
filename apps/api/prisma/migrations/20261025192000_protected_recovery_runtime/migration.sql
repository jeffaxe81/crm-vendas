-- Permit reviewed replacement of referenced ticket IDs inside a maintenance transaction.
-- Ordinary statements remain immediate; ciphertext and idempotency records are preserved.
ALTER TABLE public.email_outbox DROP CONSTRAINT email_outbox_ticket_org_fkey;
ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_ticket_org_fkey
 FOREIGN KEY (ticket_id,organization_id) REFERENCES public.tickets(id,organization_id)
 ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

-- Operational rate-limit state is deliberately excluded from CRM snapshots.
CREATE TABLE public.recovery_confirmation_attempts (
 organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 window_started_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
 attempts INTEGER NOT NULL CHECK (attempts > 0),
 PRIMARY KEY (organization_id,user_id)
);
ALTER TABLE public.recovery_confirmation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_confirmation_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY recovery_confirmation_attempts_tenant ON public.recovery_confirmation_attempts
 USING (organization_id=nullif(current_setting('app.current_organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.current_organization_id',true),'')::uuid);
CREATE TRIGGER crm_tenant_maintenance_guard BEFORE INSERT OR UPDATE OR DELETE
 ON public.recovery_confirmation_attempts FOR EACH ROW EXECUTE FUNCTION public.crm_tenant_maintenance_guard();
