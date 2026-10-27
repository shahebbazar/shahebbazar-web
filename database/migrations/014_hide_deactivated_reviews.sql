-- 014: A deleted account's reviews don't count towards a business's rating while hidden (KAN-321).
--
-- While an account is deactivated (the 30 days after deleting it, 013), its reviews are hidden from
-- the business page and its rating. Signing back in shows them again. Once the account is removed
-- they come back as from a "Former customer", unless an admin has switched off the
-- show_removed_account_reviews setting (no row means on). The API filters the review lists the same
-- way (reviewerShown in backend/lib/accountDeletion.js); this is the rating and count on business
-- cards. The same view is in database/baseline/schema.sql, after platform_settings.
-- Same columns as before. Safe to run more than once.
--
--   psql -d shahebbazar -f database/migrations/014_hide_deactivated_reviews.sql

BEGIN;

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
           FROM (public.reviews
             JOIN public.users ru ON ((ru.user_id = reviews.user_id)))
          WHERE ((reviews.vendor_id = v.vendor_id) AND ((reviews.review_status)::text = 'published'::text)
            AND ((ru.user_status)::text <> 'deactivated'::text)
            AND (((ru.user_status)::text <> 'deleted'::text) OR COALESCE((SELECT (ps.setting_value)::boolean FROM public.platform_settings ps
                  WHERE ((ps.setting_key)::text = 'show_removed_account_reviews'::text)), true)))) r ON (true))
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

COMMIT;
