-- 001: Marketing passes (KAN-283, Stage 1 of the vendor marketing package).
--
-- Adds the pass packages, each business's passes and allowance usage, and makes sponsored
-- placement end with the pass. The same objects are in database/baseline/schema.sql and
-- seed.sql, so a fresh `npm run db:load` already has them; this file brings an existing
-- database up to date. It is safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/001_marketing_passes.sql
--
-- (KAN-279 adds a migration runner; until then run it with psql, or use npm run db:reset.)

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_packages (
    package_id serial PRIMARY KEY,
    package_name character varying(100) NOT NULL,
    package_duration_days integer NOT NULL,
    package_price_bdt numeric(10,2) NOT NULL,
    package_email_campaign_limit integer DEFAULT 0 NOT NULL,
    package_ai_action_limit integer DEFAULT 0 NOT NULL,
    package_sms_limit integer DEFAULT 0 NOT NULL,
    package_is_active boolean DEFAULT true NOT NULL,
    package_sort_order smallint DEFAULT 0 NOT NULL,
    package_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_packages_package_name_key UNIQUE (package_name),
    CONSTRAINT marketing_packages_duration_check CHECK (package_duration_days IN (7, 30, 90)),
    CONSTRAINT marketing_packages_price_check CHECK (package_price_bdt >= 0),
    CONSTRAINT marketing_packages_limits_check CHECK (
        package_email_campaign_limit >= 0 AND package_ai_action_limit >= 0 AND package_sms_limit >= 0)
);

CREATE TABLE IF NOT EXISTS public.vendor_marketing_subscriptions (
    subscription_id serial PRIMARY KEY,
    vendor_id integer NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    package_id integer NOT NULL REFERENCES public.marketing_packages(package_id),
    subscription_status character varying(20) DEFAULT 'pending' NOT NULL,
    subscription_starts_at timestamp with time zone,
    subscription_ends_at timestamp with time zone,
    subscription_price_bdt numeric(10,2) NOT NULL,
    subscription_activation_source character varying(20) DEFAULT 'admin' NOT NULL,
    subscription_activated_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
    subscription_payment_ref character varying(100),
    subscription_status_reason character varying(500),
    subscription_created_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_marketing_subscriptions_status_check CHECK (
        subscription_status IN ('pending', 'active', 'expired', 'suspended', 'cancelled')),
    CONSTRAINT vendor_marketing_subscriptions_source_check CHECK (
        subscription_activation_source IN ('admin', 'sslcommerz')),
    CONSTRAINT vendor_marketing_subscriptions_dates_check CHECK (
        subscription_ends_at IS NULL OR subscription_starts_at IS NULL OR subscription_ends_at > subscription_starts_at),
    CONSTRAINT vendor_marketing_subscriptions_active_dates_check CHECK (
        subscription_status <> 'active' OR (subscription_starts_at IS NOT NULL AND subscription_ends_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_vendor_marketing_subscriptions_vendor
    ON public.vendor_marketing_subscriptions (vendor_id);
-- A business has at most one pass that is waiting or running.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_marketing_subscriptions_live
    ON public.vendor_marketing_subscriptions (vendor_id)
    WHERE subscription_status IN ('pending', 'active');

CREATE TABLE IF NOT EXISTS public.marketing_usage_events (
    usage_id bigserial PRIMARY KEY,
    subscription_id integer NOT NULL REFERENCES public.vendor_marketing_subscriptions(subscription_id) ON DELETE CASCADE,
    usage_type character varying(20) NOT NULL,
    usage_quantity integer DEFAULT 1 NOT NULL,
    usage_is_free boolean DEFAULT false NOT NULL,
    usage_reference character varying(100),
    usage_created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_usage_events_type_check CHECK (usage_type IN ('email_campaign', 'ai_action', 'sms')),
    CONSTRAINT marketing_usage_events_quantity_check CHECK (usage_quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_marketing_usage_events_subscription
    ON public.marketing_usage_events (subscription_id, usage_type);

-- Sponsored placement now ends on vendor_featured_until: a business is only featured while
-- that date is in the future. Same columns as before, so existing queries are unchanged.
CREATE OR REPLACE VIEW public.v_business_cards AS
 SELECT v.vendor_id,
    v.vendor_slug,
    v.vendor_name,
    v.vendor_name_bn,
    v.vendor_description,
    v.vendor_logo_url,
    v.vendor_cover_url,
    v.vendor_phone,
    v.vendor_address,
    (v.vendor_is_featured AND v.vendor_featured_until IS NOT NULL AND v.vendor_featured_until > now()) AS vendor_is_featured,
    (v.vendor_verified_at IS NOT NULL) AS is_verified,
    loc.location_name AS area_name,
    loc.location_name_bn AS area_name_bn,
    cat.category_name AS primary_category,
    cat.category_name_bn AS primary_category_bn,
    cat.category_slug AS primary_category_slug,
    (COALESCE(r.avg_rating, (0)::numeric))::numeric(2,1) AS rating,
    COALESCE(r.review_count, (0)::bigint) AS review_count,
    h.open_state,
    h.close_time_today
   FROM ((((public.vendors v
     LEFT JOIN public.locations loc ON ((loc.location_id = v.location_id)))
     LEFT JOIN LATERAL ( SELECT c.category_name,
            c.category_name_bn,
            c.category_slug
           FROM (public.vendor_categories vc
             JOIN public.categories c ON ((c.category_id = vc.category_id)))
          WHERE (vc.vendor_id = v.vendor_id)
          ORDER BY c.category_sort_order, c.category_id
         LIMIT 1) cat ON (true))
     LEFT JOIN LATERAL ( SELECT avg(reviews.review_rating) AS avg_rating,
            count(*) AS review_count
           FROM public.reviews
          WHERE ((reviews.vendor_id = v.vendor_id) AND ((reviews.review_status)::text = 'published'::text))) r ON (true))
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN oh.hours_is_closed THEN 'closed'::text
                    WHEN oh.hours_is_24h THEN 'open'::text
                    WHEN ((LOCALTIME >= oh.hours_open_time) AND (LOCALTIME <= oh.hours_close_time)) THEN 'open'::text
                    ELSE 'closed'::text
                END AS open_state,
                CASE
                    WHEN oh.hours_is_24h THEN NULL::time without time zone
                    ELSE oh.hours_close_time
                END AS close_time_today
           FROM public.vendor_opening_hours oh
          WHERE ((oh.vendor_id = v.vendor_id) AND ((oh.hours_day_of_week)::numeric = EXTRACT(dow FROM CURRENT_DATE)))) h ON (true))
  WHERE ((v.vendor_status)::text = 'approved'::text);

-- Reference data: the three passes proposed in the feasibility summary (prices can be changed here).
INSERT INTO public.marketing_packages
    (package_name, package_duration_days, package_price_bdt, package_email_campaign_limit, package_ai_action_limit, package_sms_limit, package_sort_order)
VALUES
    ('Marketing pass: 7 days', 7, 299, 1, 10, 0, 1),
    ('Marketing pass: 30 days', 30, 999, 4, 40, 0, 2),
    ('Marketing pass: 90 days', 90, 2499, 12, 120, 0, 3)
ON CONFLICT (package_name) DO NOTHING;

-- Businesses that are already featured get a matching admin pass, so the admin page shows why
-- they are sponsored and when that ends.
INSERT INTO public.vendor_marketing_subscriptions (
    vendor_id, package_id, subscription_status, subscription_starts_at, subscription_ends_at,
    subscription_price_bdt, subscription_activation_source, subscription_activated_by, subscription_status_reason
)
SELECT v.vendor_id, p.package_id, 'active',
       v.vendor_featured_until - make_interval(days => p.package_duration_days), v.vendor_featured_until,
       p.package_price_bdt, 'admin',
       (SELECT min(user_id) FROM public.users WHERE user_role = 'admin'),
       'Existing featured business, given a pass when passes were introduced'
FROM public.vendors v
JOIN public.marketing_packages p
  ON p.package_name = CASE WHEN v.vendor_featured_until <= now() + INTERVAL '30 days'
                           THEN 'Marketing pass: 30 days' ELSE 'Marketing pass: 90 days' END
WHERE v.vendor_is_featured
  AND v.vendor_featured_until > now()
  AND NOT EXISTS (
      SELECT 1 FROM public.vendor_marketing_subscriptions s
      WHERE s.vendor_id = v.vendor_id AND s.subscription_status IN ('pending', 'active'));

COMMIT;
