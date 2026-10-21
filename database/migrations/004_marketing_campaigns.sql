-- 004: Marketing campaigns (KAN-285, Stage 3 of the vendor marketing package).
--
-- A campaign is a business owner's brief (goal, chosen listings, offer, dates, language, call to
-- action) plus a snapshot of the business and listing details it was written from, so later edits
-- to a listing never change a campaign silently. Every saved wording is a new version; versions are
-- never changed, and the approved one is what will be sent (Stage 4). The same objects are in
-- database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/004_marketing_campaigns.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    campaign_id serial PRIMARY KEY,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    campaign_title character varying(120) NOT NULL,
    campaign_goal character varying(20) NOT NULL,
    campaign_language character varying(2) NOT NULL,
    campaign_offer character varying(200),
    campaign_starts_on date,
    campaign_ends_on date,
    campaign_call_to_action character varying(20) NOT NULL,
    campaign_listing_ids integer[] NOT NULL,
    campaign_coupon_code character varying(20),
    campaign_source_snapshot jsonb NOT NULL,
    campaign_status character varying(20) DEFAULT 'draft' NOT NULL,
    campaign_approved_version_id integer,
    campaign_approved_at timestamp with time zone,
    campaign_approved_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    campaign_posted_url text,
    campaign_created_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    campaign_created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaigns_goal_check CHECK (campaign_goal IN ('new_stock', 'offer', 'event', 'reminder')),
    CONSTRAINT marketing_campaigns_language_check CHECK (campaign_language IN ('en', 'bn')),
    CONSTRAINT marketing_campaigns_cta_check CHECK (campaign_call_to_action IN ('visit', 'call', 'message', 'order')),
    CONSTRAINT marketing_campaigns_status_check CHECK (campaign_status IN ('draft', 'approved', 'sending', 'sent', 'failed')),
    CONSTRAINT marketing_campaigns_dates_check CHECK (
        campaign_ends_on IS NULL OR campaign_starts_on IS NULL OR campaign_ends_on >= campaign_starts_on),
    CONSTRAINT marketing_campaigns_listings_check CHECK (cardinality(campaign_listing_ids) BETWEEN 1 AND 3),
    -- An offer's coupon is valid for the offer's dates, so it needs a last day.
    CONSTRAINT marketing_campaigns_coupon_check CHECK (campaign_coupon_code IS NULL OR (
        campaign_goal = 'offer' AND campaign_ends_on IS NOT NULL AND campaign_coupon_code ~ '^[A-Z0-9-]{3,20}$'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_vendor
    ON public.marketing_campaigns (vendor_id, campaign_updated_at DESC);

-- Every saved wording of a campaign: email, Facebook and WhatsApp text together. Never updated.
CREATE TABLE IF NOT EXISTS public.marketing_campaign_versions (
    version_id serial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    version_content jsonb NOT NULL,
    version_method character varying(10) NOT NULL,
    version_created_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    version_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaign_versions_method_check CHECK (version_method IN ('template', 'manual', 'ai')),
    CONSTRAINT marketing_campaign_versions_number_key UNIQUE (campaign_id, version_number)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_campaigns_approved_version_fkey') THEN
        ALTER TABLE public.marketing_campaigns
            ADD CONSTRAINT marketing_campaigns_approved_version_fkey
            FOREIGN KEY (campaign_approved_version_id) REFERENCES public.marketing_campaign_versions(version_id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;
