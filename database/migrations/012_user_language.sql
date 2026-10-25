-- 012: A customer's preferred language (My details): English or Bangla.
--
-- Businesses see how many of their email subscribers prefer Bangla when they start a campaign, and the
-- campaign's language starts on the one most of them prefer. The same column is in
-- database/baseline/schema.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/012_user_language.sql

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_language character varying(2) DEFAULT 'en' NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_user_language_check;
ALTER TABLE public.users ADD CONSTRAINT users_user_language_check
    CHECK (((user_language)::text = ANY ((ARRAY['en'::character varying, 'bn'::character varying])::text[])));

COMMIT;
