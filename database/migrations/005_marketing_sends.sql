-- 005: Marketing email sending (KAN-286, Stage 4 of the vendor marketing package).
--
-- marketing_sends records every email a campaign sent: who it went to, through which provider,
-- and whether the provider accepted it. Usage is now recorded against the business as well as the
-- pass, so a business without a pass can use its free monthly email (subscription_id is empty
-- then). A campaign records when it was sent and by whom. The same objects are in
-- database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/005_marketing_sends.sql

BEGIN;

-- Usage belongs to a business; the pass is empty for the free plan.
ALTER TABLE public.marketing_usage_events
    ADD COLUMN IF NOT EXISTS vendor_id integer REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;
UPDATE public.marketing_usage_events u
SET vendor_id = s.vendor_id
FROM public.vendor_marketing_subscriptions s
WHERE s.subscription_id = u.subscription_id AND u.vendor_id IS NULL;
ALTER TABLE public.marketing_usage_events ALTER COLUMN vendor_id SET NOT NULL;
ALTER TABLE public.marketing_usage_events ALTER COLUMN subscription_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_usage_events_vendor
    ON public.marketing_usage_events (vendor_id, usage_type, usage_created_at);

ALTER TABLE public.marketing_campaigns
    ADD COLUMN IF NOT EXISTS campaign_sent_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS campaign_sent_by integer REFERENCES public.users(user_id) ON DELETE SET NULL;

-- One row per email a campaign sent. Kept when the customer's account is deleted (user_id empties).
CREATE TABLE IF NOT EXISTS public.marketing_sends (
    send_id bigserial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    user_id integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    send_channel character varying(10) DEFAULT 'email' NOT NULL,
    send_address character varying(255) NOT NULL,
    send_status character varying(20) NOT NULL,
    send_provider character varying(20) NOT NULL,
    send_provider_message_id character varying(255),
    send_error character varying(500),
    send_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_sends_channel_check CHECK (send_channel IN ('email')),
    CONSTRAINT marketing_sends_status_check CHECK (send_status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_sends_campaign ON public.marketing_sends (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_sends_vendor ON public.marketing_sends (vendor_id, send_created_at DESC);

COMMIT;
