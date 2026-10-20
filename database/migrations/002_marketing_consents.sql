-- 002: Marketing consent (KAN-284, Stage 2 of the vendor marketing package).
--
-- A customer's permission for one business to send them offers by email or SMS. It is kept
-- apart from saved_businesses: saving a business never gives consent by itself. Withdrawing
-- keeps the row (consent_withdrawn_at), and giving it again adds a new one, so there is a full
-- record of when consent was given and withdrawn, and how. The same objects are in
-- database/baseline/schema.sql, so a fresh `npm run db:load` already has them. Safe to run
-- more than once.
--
--   psql -d shahebbazar -f database/migrations/002_marketing_consents.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_consents (
    consent_id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    consent_channel character varying(10) NOT NULL,
    consent_source character varying(20) NOT NULL,
    consent_given_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_withdrawn_at timestamp with time zone,
    consent_withdrawn_source character varying(20),
    CONSTRAINT marketing_consents_channel_check CHECK (consent_channel IN ('email', 'sms')),
    CONSTRAINT marketing_consents_source_check CHECK (consent_source IN ('save_prompt', 'account')),
    CONSTRAINT marketing_consents_withdrawn_source_check CHECK (
        consent_withdrawn_source IN ('account', 'unsubscribe_link', 'unsaved')),
    CONSTRAINT marketing_consents_withdrawn_check CHECK (
        (consent_withdrawn_at IS NULL) = (consent_withdrawn_source IS NULL))
);

-- At most one active consent per customer, business and channel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_consents_active
    ON public.marketing_consents (user_id, vendor_id, consent_channel)
    WHERE consent_withdrawn_at IS NULL;
-- A business's audience for one channel.
CREATE INDEX IF NOT EXISTS idx_marketing_consents_audience
    ON public.marketing_consents (vendor_id, consent_channel)
    WHERE consent_withdrawn_at IS NULL;

COMMIT;
