-- 007: Visits from marketing campaigns (KAN-287).
--
-- Links in campaign emails and in the Facebook and WhatsApp posting tools carry the channel and the
-- campaign, so a visit to the business page can be counted for that campaign. Adds the email,
-- facebook and whatsapp sources and the campaign each visit came from. The same objects are in
-- database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/007_campaign_visits.sql

BEGIN;

ALTER TABLE public.vendor_profile_views
    ADD COLUMN IF NOT EXISTS view_campaign_id integer REFERENCES public.marketing_campaigns(campaign_id) ON DELETE SET NULL;

ALTER TABLE public.vendor_profile_views DROP CONSTRAINT IF EXISTS vendor_profile_views_view_source_check;
ALTER TABLE public.vendor_profile_views ADD CONSTRAINT vendor_profile_views_view_source_check CHECK (
    view_source IN ('search', 'category', 'direct', 'share', 'sponsored', 'email', 'facebook', 'whatsapp'));

CREATE INDEX IF NOT EXISTS idx_vendor_profile_views_campaign
    ON public.vendor_profile_views (view_campaign_id) WHERE view_campaign_id IS NOT NULL;

COMMIT;
