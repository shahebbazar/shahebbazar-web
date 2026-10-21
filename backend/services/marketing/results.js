// Marketing results (KAN-287): what the business's marketing did over the last 7, 30 or 90 days,
// against the period before. Open to every plan, so results stay visible after a pass ends.
// Open and click tracking is cut from the MVP, so email results are what was sent and who unsubscribed.

const PERIODS = [7, 30, 90];
const RECENT_LIMIT = 5;

/** The number of days asked for, or 30. */
const periodOf = (raw) => (PERIODS.includes(Number(raw)) ? Number(raw) : 30);

async function marketingResults(db, vendorId, days) {
    const [figures, recent] = await Promise.all([
        db.query(
            `WITH bounds AS (
                 SELECT (CURRENT_DATE - ($2::int - 1))::timestamptz AS cur_start,
                        (CURRENT_DATE - (2 * $2::int - 1))::timestamptz AS prev_start
             )
             SELECT
                 (SELECT COUNT(*)::int FROM vendor_profile_views, bounds
                  WHERE vendor_id = $1 AND view_source = 'sponsored' AND view_created_at >= cur_start) AS sponsored_current,
                 (SELECT COUNT(*)::int FROM vendor_profile_views, bounds
                  WHERE vendor_id = $1 AND view_source = 'sponsored' AND view_created_at >= prev_start AND view_created_at < cur_start) AS sponsored_previous,
                 (SELECT COUNT(*)::int FROM vendor_profile_views, bounds
                  WHERE vendor_id = $1 AND view_source = 'share' AND view_created_at >= cur_start) AS shared_current,
                 (SELECT COUNT(*)::int FROM vendor_profile_views, bounds
                  WHERE vendor_id = $1 AND view_source = 'share' AND view_created_at >= prev_start AND view_created_at < cur_start) AS shared_previous,
                 (SELECT COALESCE(SUM(impression_count), 0)::int FROM vendor_search_impressions, bounds
                  WHERE vendor_id = $1 AND impression_day >= cur_start::date) AS appearances_current,
                 (SELECT COALESCE(SUM(impression_count), 0)::int FROM vendor_search_impressions, bounds
                  WHERE vendor_id = $1 AND impression_day >= prev_start::date AND impression_day < cur_start::date) AS appearances_previous,
                 (SELECT COUNT(*)::int FROM marketing_campaigns, bounds
                  WHERE vendor_id = $1 AND campaign_sent_at >= cur_start) AS campaigns_sent,
                 (SELECT COUNT(*)::int FROM marketing_sends, bounds
                  WHERE vendor_id = $1 AND send_status = 'sent' AND send_created_at >= cur_start) AS emails_sent,
                 (SELECT COUNT(*)::int FROM marketing_sends, bounds
                  WHERE vendor_id = $1 AND send_status = 'failed' AND send_created_at >= cur_start) AS emails_failed,
                 (SELECT COUNT(*)::int FROM marketing_consents, bounds
                  WHERE vendor_id = $1 AND consent_channel = 'email' AND consent_given_at >= cur_start) AS subscribed,
                 (SELECT COUNT(*)::int FROM marketing_consents, bounds
                  WHERE vendor_id = $1 AND consent_channel = 'email' AND consent_withdrawn_at >= cur_start) AS unsubscribed,
                 (SELECT COUNT(*)::int FROM marketing_campaign_posts, bounds
                  WHERE vendor_id = $1 AND post_channel = 'facebook' AND post_marked_at >= cur_start) AS facebook_posts,
                 (SELECT COUNT(*)::int FROM marketing_campaign_posts, bounds
                  WHERE vendor_id = $1 AND post_channel = 'whatsapp' AND post_marked_at >= cur_start) AS whatsapp_posts`,
            [vendorId, days]
        ),
        // The latest campaigns that went out by email or were posted, in this period.
        db.query(
            `WITH bounds AS (SELECT (CURRENT_DATE - ($2::int - 1))::timestamptz AS cur_start)
             SELECT c.campaign_id, c.campaign_title, c.campaign_sent_at,
                    (SELECT COUNT(*)::int FROM marketing_sends s WHERE s.campaign_id = c.campaign_id AND s.send_status = 'sent') AS emails_sent,
                    COALESCE((SELECT array_agg(p.post_channel ORDER BY p.post_channel) FROM marketing_campaign_posts p
                              WHERE p.campaign_id = c.campaign_id), '{}') AS posted_on,
                    GREATEST(c.campaign_sent_at,
                             (SELECT max(p.post_marked_at) FROM marketing_campaign_posts p WHERE p.campaign_id = c.campaign_id)) AS last_activity
             FROM marketing_campaigns c, bounds
             WHERE c.vendor_id = $1
               AND (c.campaign_sent_at >= cur_start
                    OR EXISTS (SELECT 1 FROM marketing_campaign_posts p WHERE p.campaign_id = c.campaign_id AND p.post_marked_at >= cur_start))
             ORDER BY last_activity DESC
             LIMIT $3`,
            [vendorId, days, RECENT_LIMIT]
        ),
    ]);
    const f = figures.rows[0];
    return {
        days,
        sponsored_views: { current: f.sponsored_current, previous: f.sponsored_previous },
        shared_link_views: { current: f.shared_current, previous: f.shared_previous },
        search_appearances: { current: f.appearances_current, previous: f.appearances_previous },
        email: {
            campaigns_sent: f.campaigns_sent,
            emails_sent: f.emails_sent,
            emails_failed: f.emails_failed,
            subscribed: f.subscribed,
            unsubscribed: f.unsubscribed,
        },
        posts: { facebook: f.facebook_posts, whatsapp: f.whatsapp_posts },
        recent: recent.rows,
    };
}

module.exports = { PERIODS, periodOf, marketingResults };
