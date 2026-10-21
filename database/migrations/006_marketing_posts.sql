-- 006: Facebook and WhatsApp posts (KAN-287, Stage 5 of the vendor marketing package).
--
-- Shaheb Bazar doesn't post to Facebook or WhatsApp; the owner posts the campaign's text themselves
-- and marks it as posted here, with a link to the post if they have one. One row per campaign and
-- channel, recording which version was posted. Replaces marketing_campaigns.campaign_posted_url,
-- which was never used. The same objects are in database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/006_marketing_posts.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_campaign_posts (
    post_id serial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    post_channel character varying(10) NOT NULL,
    post_url character varying(500),
    post_version_id integer REFERENCES public.marketing_campaign_versions(version_id) ON DELETE SET NULL,
    post_marked_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    post_marked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaign_posts_channel_check CHECK (post_channel IN ('facebook', 'whatsapp')),
    CONSTRAINT marketing_campaign_posts_url_check CHECK (post_url IS NULL OR post_url ~ '^https?://'),
    CONSTRAINT marketing_campaign_posts_channel_key UNIQUE (campaign_id, post_channel)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_posts_vendor
    ON public.marketing_campaign_posts (vendor_id, post_marked_at DESC);

ALTER TABLE public.marketing_campaigns DROP COLUMN IF EXISTS campaign_posted_url;

COMMIT;
