-- 003: Platform settings (KAN-293, client feedback 20 October 2026).
--
-- Settings an admin can change without a code release. The first two let the client switch
-- off admin approval of new businesses and of new products and services. Both start on
-- (approval required), which is how the site has worked so far. The same objects are in
-- database/baseline/schema.sql and seed.sql. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/003_platform_settings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_settings (
    setting_key character varying(50) PRIMARY KEY,
    setting_value jsonb NOT NULL,
    setting_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    setting_updated_by integer REFERENCES public.users(user_id) ON DELETE SET NULL
);

INSERT INTO public.platform_settings (setting_key, setting_value) VALUES
    ('require_business_approval', 'true'),
    ('require_listing_approval', 'true')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
