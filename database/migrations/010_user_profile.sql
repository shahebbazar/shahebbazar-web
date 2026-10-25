-- 010: A customer's profile photo and area (My details).
--
-- The photo shows beside their name in the header and on their reviews.
-- The area is optional; it shows on their reviews ("Talaimari"), as review sites do, so readers can
-- see the reviewer is local. The same columns are in database/baseline/schema.sql. Safe to run more
-- than once.
--
--   psql -d shahebbazar -f database/migrations/010_user_profile.sql

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_avatar_url character varying(500);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_id integer;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_location_id_fkey;
ALTER TABLE public.users ADD CONSTRAINT users_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE SET NULL;

COMMIT;
