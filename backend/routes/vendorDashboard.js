const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");
const { memberBusinesses } = require("../lib/membership");
// Provider dashboard data.


// Offered as tabs on the dashboard. Anything else falls back to 30.
const PERIODS = new Set([7, 30, 90]);
const DEFAULT_PERIOD = 30;
const LISTING_PREVIEW_LIMIT = 3;

function parseVendorId(raw) {
    return /^\d+$/.test(raw) && Number(raw) > 0 && Number(raw) <= 2147483647
        ? Number(raw)
        : null;
}

router.get(
    "/vendor-account/businesses",
    requireFeature("business.list"),
    async (req, res) => {
        try {
            return res.json(await memberBusinesses(req.user.user_id));
        } catch (error) {
            console.error(
                "GET /api/vendor-account/businesses failed:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Could not load your businesses.",
            });
        }
    }
);
// GET /api/vendors/:vendorId/dashboard?days=7|30|90: dashboard figures for a business in any status.
router.get("/vendors/:vendorId/dashboard",
    requireFeature("business.dashboard"), requireVendorOwnership,
    async (req, res) => {
        const vendorId = req.user.user_role === "admin" ? parseVendorId(req.params.vendorId) : req.vendor.vendor_id;
        if (vendorId === null) {
            return res.status(400).json({ error: "Invalid vendor id" });
        }

        const requested = Number(req.query.days);
        const days = PERIODS.has(requested) ? requested : DEFAULT_PERIOD;

        try {
            const vendorResult = await pool.query(
                `SELECT v.vendor_id, v.vendor_slug, v.vendor_name, v.vendor_description,
                    v.vendor_phone, v.vendor_email, v.vendor_address,
                    v.vendor_logo_url, v.vendor_cover_url,
                    v.vendor_status, v.vendor_rejection_reason,
                    v.vendor_verified_at IS NOT NULL AS is_verified,
                    v.vendor_created_at,
                    loc.location_name AS area_name,
                    (SELECT c.category_name
                     FROM vendor_categories vc
                     JOIN categories c ON c.category_id = vc.category_id
                     WHERE vc.vendor_id = v.vendor_id
                     ORDER BY c.category_sort_order, c.category_id
                     LIMIT 1) AS primary_category,
                    b.open_state, b.close_time_today
             FROM vendors v
             LEFT JOIN locations loc ON loc.location_id = v.location_id
             LEFT JOIN v_business_cards b ON b.vendor_id = v.vendor_id
             WHERE v.vendor_id = $1`,
                [vendorId]
            );

            if (vendorResult.rowCount === 0) {
                return res.status(404).json({ error: "Vendor not found" });
            }

            const [stats, series, listings] = await Promise.all([
                pool.query(
                    `WITH bounds AS (
                     SELECT (CURRENT_DATE - ($2::int - 1)) AS cur_start,
                            (CURRENT_DATE - (2 * $2::int - 1)) AS prev_start
                 )
                 SELECT
                     (SELECT COUNT(*)::int FROM vendor_profile_views, bounds
                      WHERE vendor_id = $1 AND view_created_at >= cur_start) AS views_current,
                     (SELECT COUNT(*)::int FROM vendor_profile_views, bounds
                      WHERE vendor_id = $1 AND view_created_at >= prev_start
                        AND view_created_at < cur_start) AS views_previous,
                     (SELECT COALESCE(SUM(impression_count), 0)::int
                      FROM vendor_search_impressions, bounds
                      WHERE vendor_id = $1 AND impression_day >= cur_start) AS appearances_current,
                     (SELECT COALESCE(SUM(impression_count), 0)::int
                      FROM vendor_search_impressions, bounds
                      WHERE vendor_id = $1 AND impression_day >= prev_start
                        AND impression_day < cur_start) AS appearances_previous,
                     (SELECT COUNT(*)::int FROM vendor_listings
                      WHERE vendor_id = $1 AND listing_status = 'approved') AS listings_active,
                     (SELECT COUNT(*)::int FROM vendor_listings, bounds
                      WHERE vendor_id = $1 AND listing_status = 'approved'
                        AND listing_created_at >= cur_start) AS listings_added,
                     (SELECT COUNT(*)::int FROM vendor_listings
                      WHERE vendor_id = $1 AND listing_status = 'pending') AS listings_pending,
                     (SELECT COUNT(*)::int FROM vendor_listings
                      WHERE vendor_id = $1) AS listings_total,
                     (SELECT ROUND(AVG(review_rating), 1) FROM reviews
                      WHERE vendor_id = $1 AND review_status = 'published') AS rating,
                     (SELECT COUNT(*)::int FROM reviews
                      WHERE vendor_id = $1 AND review_status = 'published') AS review_count`,
                    [vendorId, days]
                ),

                // One row per day, zero-filled, so the chart has no gaps.
                pool.query(
                    `WITH days AS (
                     SELECT (CURRENT_DATE - g)::date AS day
                     FROM generate_series(0, $2::int - 1) AS g
                 ),
                 views AS (
                     SELECT view_created_at::date AS day, COUNT(*)::int AS n
                     FROM vendor_profile_views
                     WHERE vendor_id = $1 AND view_created_at >= CURRENT_DATE - ($2::int - 1)
                     GROUP BY 1
                 )
                 SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                        COALESCE(v.n, 0) AS views,
                        COALESCE(i.impression_count, 0) AS appearances
                 FROM days d
                 LEFT JOIN views v ON v.day = d.day
                 LEFT JOIN vendor_search_impressions i
                        ON i.vendor_id = $1 AND i.impression_day = d.day
                 ORDER BY d.day`,
                    [vendorId, days]
                ),

                pool.query(
                    `SELECT l.listing_id, l.listing_title, l.listing_price, l.listing_price_max,
                        l.listing_price_unit, l.listing_status,
                        c.category_name,
                        (SELECT p.photo_url FROM listing_photos p
                         WHERE p.listing_id = l.listing_id
                         ORDER BY p.photo_is_primary DESC, p.photo_sort_order, p.photo_id
                         LIMIT 1) AS photo_url
                 FROM vendor_listings l
                 LEFT JOIN categories c ON c.category_id = l.category_id
                 WHERE l.vendor_id = $1 AND l.listing_status <> 'archived'
                 ORDER BY l.listing_created_at DESC, l.listing_id DESC
                 LIMIT $2`,
                    [vendorId, LISTING_PREVIEW_LIMIT]
                ),
            ]);

            const s = stats.rows[0];

            res.json({
                vendor: vendorResult.rows[0],
                days,
                stats: {
                    profileViews: { current: s.views_current, previous: s.views_previous },
                    searchAppearances: {
                        current: s.appearances_current,
                        previous: s.appearances_previous,
                    },
                    listings: {
                        active: s.listings_active,
                        addedInPeriod: s.listings_added,
                        pending: s.listings_pending,
                        total: s.listings_total,
                    },
                    // NUMERIC arrives from node-pg as a string.
                    rating: {
                        average: s.rating === null ? null : Number(s.rating),
                        count: s.review_count,
                    },
                },
                series: series.rows,
                listings: listings.rows,
            });
        } catch (err) {
            console.error(`GET /api/vendors/${vendorId}/dashboard failed:`, err);
            res.status(500).json({ error: "Could not load the dashboard" });
        }
    });

// GET /api/vendors/:vendorId/summary: name, slug and status for a provider page's frame.
router.get( "/vendors/:vendorId/summary", 
    requireFeature("business.dashboard"), requireVendorOwnership, 
    async (req, res) => {    
        const vendorId = req.user.user_role === "admin" ? parseVendorId(req.params.vendorId) : req.vendor.vendor_id;
    if (vendorId === null) {
        return res.status(400).json({ error: "Invalid vendor id" });
    }

    try {
        const result = await pool.query(
            `SELECT vendor_id, vendor_name, vendor_slug, vendor_status
             FROM vendors WHERE vendor_id = $1`,
            [vendorId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Vendor not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/summary failed:`, err);
        res.status(500).json({ error: "Could not load the business" });
    }
});

module.exports = router;
