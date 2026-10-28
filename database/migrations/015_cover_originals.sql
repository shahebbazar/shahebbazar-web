-- 015: A cropped cover photo keeps the photo it was cut from (KAN-330).
--
-- A business's or event's cover is cropped to the share-card shape before it is saved. Keeping the
-- original and where it was cropped lets the owner crop it again later, including zooming back out to
-- the whole photo. Photos saved before this have neither: cropping one keeps the file it replaces as
-- its original. The same columns are in database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/015_cover_originals.sql

BEGIN;

ALTER TABLE public.vendor_photos ADD COLUMN IF NOT EXISTS vendor_photo_original_url text;
ALTER TABLE public.vendor_photos ADD COLUMN IF NOT EXISTS vendor_photo_crop jsonb;

ALTER TABLE public.event_photos ADD COLUMN IF NOT EXISTS photo_original_url text;
ALTER TABLE public.event_photos ADD COLUMN IF NOT EXISTS photo_crop jsonb;

COMMIT;
