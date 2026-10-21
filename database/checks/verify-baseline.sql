-- Fails by returning rows when required objects/data are missing.
WITH required_relations(object_name, object_type) AS (
    VALUES
        ('users', 'table'),
        ('sessions', 'table'),
        ('otp_codes', 'table'),
        ('locations', 'table'),
        ('categories', 'table'),
        ('vendors', 'table'),
        ('vendor_categories', 'table'),
        ('vendor_listings', 'table'),
        ('listing_photos', 'table'),
        ('quote_requests', 'table'),
        ('quote_responses', 'table'),
        ('conversations', 'table'),
        ('messages', 'table'),
        ('notifications', 'table'),
        ('reviews', 'table'),
        ('reports', 'table'),
        ('audit_logs', 'table'),
        ('search_logs', 'table'),
        ('vendor_profile_views', 'table'),
        ('vendor_opening_hours', 'table'),
        ('events', 'table'),
        ('saved_businesses', 'table'),
        ('vendor_facts', 'table'),
        ('vendor_payment_methods', 'table'),
        ('vendor_search_impressions', 'table'),
        ('vendor_photos', 'table'),
        ('vendor_social_links', 'table'),
        ('vendor_members', 'table'),
        ('marketing_packages', 'table'),
        ('vendor_marketing_subscriptions', 'table'),
        ('marketing_usage_events', 'table'),
        ('marketing_consents', 'table'),
        ('platform_settings', 'table'),
        ('marketing_campaigns', 'table'),
        ('marketing_campaign_versions', 'table'),
        ('marketing_sends', 'table'),
        ('marketing_campaign_posts', 'table'),
        ('v_business_cards', 'view'),
        ('v_search_trends_daily', 'view'),
        ('v_moderation_queue', 'view'),
        ('v_active_users_daily', 'view')
), missing_relations AS (
    SELECT r.object_type, r.object_name
    FROM required_relations r
    WHERE to_regclass('public.' || r.object_name) IS NULL
), required_columns(table_name, column_name) AS (
    VALUES
        ('reviews', 'review_reply'),
        ('reviews', 'review_replied_at'),
        ('vendors', 'vendor_nid_reference'),
        ('vendors', 'vendor_nid_status'),
        ('vendors', 'vendor_nid_submitted_at'),
        ('vendors', 'vendor_nid_verified_at'),
        ('vendors', 'vendor_nid_verified_by')
), missing_columns AS (
    SELECT 'column'::text AS object_type, c.table_name || '.' || c.column_name AS object_name
    FROM required_columns c
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns i
        WHERE i.table_schema = 'public'
          AND i.table_name = c.table_name
          AND i.column_name = c.column_name
    )
), data_issues AS (
    SELECT 'data'::text AS object_type, 'users has no customer/vendor/admin coverage'::text AS object_name
    WHERE EXISTS (
        SELECT role_name
        FROM (VALUES ('customer'), ('vendor'), ('admin')) roles(role_name)
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_role = roles.role_name)
    )
    UNION ALL
    SELECT 'data', 'no approved public business cards'
    WHERE NOT EXISTS (SELECT 1 FROM v_business_cards)
    UNION ALL
    SELECT 'data', 'marketing_packages is missing the 7, 30 or 90-day pass'
    WHERE (SELECT COUNT(DISTINCT package_duration_days) FROM marketing_packages WHERE package_is_active) < 3
)
SELECT * FROM missing_relations
UNION ALL SELECT * FROM missing_columns
UNION ALL SELECT * FROM data_issues
ORDER BY object_type, object_name;
