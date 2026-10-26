ALTER TABLE public.purge_policies ADD COLUMN categories TEXT[] NOT NULL DEFAULT ARRAY['EXPIRED_OPERATION_PREVIEWS']::text[];
ALTER TABLE public.purge_policies ADD CONSTRAINT purge_categories_valid CHECK (
 cardinality(categories) BETWEEN 1 AND 2 AND categories <@ ARRAY['EXPIRED_OPERATION_PREVIEWS','TERMINAL_WEBHOOK_DELIVERIES']::text[]
);
-- Updates remain forbidden. Deletion is limited by tenant RLS, maintenance guard,
-- explicit policy opt-in, retention, terminal dispatch and transaction context.
CREATE OR REPLACE FUNCTION public.crm_webhook_delivery_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' AND current_setting('app.technical_purge', true) = 'on'
 AND OLD.organization_id = nullif(current_setting('app.current_organization_id',true),'')::uuid
 AND EXISTS (SELECT 1 FROM public.purge_policies p JOIN public.webhook_dispatches d ON d.organization_id=p.organization_id
   WHERE p.organization_id=OLD.organization_id AND p.enabled
   AND 'TERMINAL_WEBHOOK_DELIVERIES'=ANY(p.categories)
   AND d.id=OLD.dispatch_id AND d.status IN ('DELIVERED','EXHAUSTED','CANCELLED')
   AND d.locked_until IS NULL AND d.lease_token IS NULL
   AND OLD.created_at < CURRENT_TIMESTAMP - p.retention_days * INTERVAL '1 day'
   AND d.updated_at < CURRENT_TIMESTAMP - p.retention_days * INTERVAL '1 day') THEN RETURN OLD;
 END IF;
 RAISE EXCEPTION 'webhook delivery attempts are immutable' USING ERRCODE='42501';
END $$;
