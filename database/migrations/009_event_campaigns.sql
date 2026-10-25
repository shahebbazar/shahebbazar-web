-- 009: Campaigns about a business's events (KAN-298).
--
-- An event campaign can be about one of the business's own events, whose name, time, place and photo
-- are copied into the campaign's snapshot. Such a campaign can go without products, so a campaign now
-- lists 0 to 3 products; the API still asks for at least one for every other campaign. The same
-- constraint is in database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/009_event_campaigns.sql

BEGIN;

ALTER TABLE public.marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_listings_check;
ALTER TABLE public.marketing_campaigns ADD CONSTRAINT marketing_campaigns_listings_check
    CHECK (cardinality(campaign_listing_ids) BETWEEN 0 AND 3);

COMMIT;
