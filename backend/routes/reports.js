const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");
const { requireFeature } = require("../lib/access");


const router = express.Router();

const TARGET_TYPES = ["vendor", "listing", "review", "message"];
const REASONS = ["spam", "fake", "fake_review", "inappropriate", "wrong_info", "scam", "other"];
const DETAILS_MAX = 1000;
const PERIODS = [7, 30, 90];

// SQL that checks a report target exists, keyed by target type.
const TARGET_EXISTS = {
    vendor: "SELECT 1 FROM vendors WHERE vendor_id = $1",
    listing: "SELECT 1 FROM vendor_listings WHERE listing_id = $1",
    review: "SELECT 1 FROM reviews WHERE review_id = $1",
    message: "SELECT 1 FROM messages WHERE message_id = $1",
};

// Writes one audit_logs entry inside the caller's transaction.
function audit(db, actor, action, type, id, before, after) {
    return db.query(
        `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actor, action, type, id, JSON.stringify(before), JSON.stringify(after)]
    );
}

router.post( "/reports", 
    requireFeature("reports.submit"),
    async (req, res) => {
    const type = req.body?.target_type;
    const targetId = parseId(req.body?.target_id);
    const reason = req.body?.reason;
    const details = cleanText(req.body?.details) || null;
    if (!TARGET_TYPES.includes(type) || !targetId) return res.status(400).json({ error: "Invalid item to report." });
    if (!REASONS.includes(reason)) return res.status(400).json({ error: "Choose a reason." });
    if (details && details.length > DETAILS_MAX) {
        return res.status(400).json({ error: `Keep the details under ${DETAILS_MAX} characters.` });
    }

    try {
        const userId = req.user.user_id;
        const target = await pool.query(TARGET_EXISTS[type], [targetId]);
        if (target.rowCount === 0) return res.status(404).json({ error: "That item no longer exists." });
        const duplicate = await pool.query(
            `SELECT 1 FROM reports WHERE report_target_type = $1 AND report_target_id = $2
               AND reporter_user_id = $3 AND report_status = 'open'`,
            [type, targetId, userId]
        );
        if (duplicate.rowCount > 0) return res.status(409).json({ error: "You have already reported this. Our team will review it." });

        const result = await pool.query(
            `INSERT INTO reports (report_target_type, report_target_id, reporter_user_id, report_reason, report_details)
             VALUES ($1, $2, $3, $4, $5) RETURNING report_id`,
            [type, targetId, userId, reason, details]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("POST /api/reports failed:", err);
        res.status(500).json({ error: "Could not send the report. Try again." });
    }
    }
);

// /admin routes need a signed-in admin (see index.js); actions are recorded against that admin.
router.get("/admin/reports", requireFeature("admin.moderation"), async (req, res) => {

    try {
        const result = await pool.query(
            `SELECT r.report_id, r.report_target_type AS target_type, r.report_target_id AS target_id,
                    r.report_reason AS reason, r.report_details AS details, r.report_status AS status,
                    r.report_created_at AS created_at, r.report_resolved_at AS resolved_at,
                    reporter.user_name AS reporter_name, resolver.user_name AS resolver_name,
                    CASE r.report_target_type
                        WHEN 'vendor' THEN (SELECT vendor_name FROM vendors WHERE vendor_id = r.report_target_id)
                        WHEN 'listing' THEN (SELECT listing_title FROM vendor_listings WHERE listing_id = r.report_target_id)
                        WHEN 'review' THEN (SELECT left(coalesce(review_body, review_rating || ' stars'), 160) FROM reviews WHERE review_id = r.report_target_id)
                        WHEN 'message' THEN (SELECT left(message_body, 160) FROM messages WHERE message_id = r.report_target_id)
                    END AS target_label,
                    CASE r.report_target_type
                        WHEN 'vendor' THEN (SELECT vendor_slug FROM vendors WHERE vendor_id = r.report_target_id)
                        WHEN 'listing' THEN (SELECT v.vendor_slug FROM vendor_listings l JOIN vendors v USING (vendor_id) WHERE l.listing_id = r.report_target_id)
                        WHEN 'review' THEN (SELECT v.vendor_slug FROM reviews rv JOIN vendors v USING (vendor_id) WHERE rv.review_id = r.report_target_id)
                    END AS business_slug
             FROM reports r
             LEFT JOIN users reporter ON reporter.user_id = r.reporter_user_id
             LEFT JOIN users resolver ON resolver.user_id = r.report_resolved_by
             WHERE r.report_status = 'open' OR r.report_resolved_at > NOW() - INTERVAL '30 days'
             ORDER BY r.report_status <> 'open', r.report_created_at`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/admin/reports failed:", err);
        res.status(500).json({ error: "Could not load reports" });
    }
});

router.post("/admin/reports/:id/resolve", requireFeature("admin.moderation"), async (req, res) => {
    const id = parseId(req.params.id);
    const action = req.body?.action;
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (action !== "dismiss" && action !== "take_down") return res.status(400).json({ error: 'action must be "dismiss" or "take_down"' });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const actor = req.user.user_id;
        const current = await client.query(
            `SELECT report_status, report_target_type, report_target_id FROM reports WHERE report_id = $1 FOR UPDATE`,
            [id]
        );
        if (current.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Report not found" });
        }
        const report = current.rows[0];
        if (report.report_status !== "open") {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: `This report was already ${report.report_status}. Reload to see the current list.` });
        }

        if (action === "take_down") {
            const takeDown = {
                vendor: "UPDATE vendors SET vendor_status = 'suspended', vendor_updated_at = NOW() WHERE vendor_id = $1",
                listing: "UPDATE vendor_listings SET listing_status = 'archived', listing_updated_at = NOW() WHERE listing_id = $1",
                review: "UPDATE reviews SET review_status = 'hidden' WHERE review_id = $1",
                message: `UPDATE conversations SET conversation_status = 'blocked'
                          WHERE conversation_id = (SELECT conversation_id FROM messages WHERE message_id = $1)`,
            };
            await client.query(takeDown[report.report_target_type], [report.report_target_id]);
        }

        const status = action === "take_down" ? "actioned" : "dismissed";
        await client.query(
            `UPDATE reports SET report_status = $2, report_resolved_by = $3, report_resolved_at = NOW()
             WHERE report_id = $1`,
            [id, status, actor]
        );
        await audit(client, actor, `report.${action}`, report.report_target_type, report.report_target_id,
            { report_id: id, status: "open" }, { report_id: id, status });
        await client.query("COMMIT");
        res.json({ report_id: id, status });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`POST /api/admin/reports/${id}/resolve failed:`, err);
        res.status(500).json({ error: "Could not save the decision. Nothing was changed." });
    } finally {
        client.release();
    }
});

router.get("/admin/reviews", requireFeature("admin.moderation"), async (req, res) => {
    const status = req.query.status === "hidden" ? "hidden" : "published";
    try {
        const result = await pool.query(
            `SELECT r.review_id, r.review_rating AS rating, r.review_body AS body, r.review_status AS status,
                    r.review_created_at AS created_at, u.user_name AS author,
                    v.vendor_name, v.vendor_slug,
                    (SELECT COUNT(*)::int FROM reports p WHERE p.report_target_type = 'review'
                       AND p.report_target_id = r.review_id AND p.report_status = 'open') AS open_reports
             FROM reviews r
             JOIN users u ON u.user_id = r.user_id
             JOIN vendors v ON v.vendor_id = r.vendor_id
             WHERE r.review_status = $1 AND (r.review_body IS NOT NULL OR $1 = 'hidden')
             ORDER BY open_reports DESC, r.review_created_at DESC
             LIMIT 50`,
            [status]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/admin/reviews failed:", err);
        res.status(500).json({ error: "Could not load reviews" });
    }
});

router.post("/admin/reviews/:id/status", requireFeature("admin.moderation"), async (req, res) => {
    const id = parseId(req.params.id);
    const status = req.body?.status;
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (status !== "published" && status !== "hidden") return res.status(400).json({ error: 'status must be "published" or "hidden"' });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const actor = req.user.user_id;
        const current = await client.query("SELECT review_status FROM reviews WHERE review_id = $1 FOR UPDATE", [id]);
        if (current.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Review not found" });
        }
        await client.query("UPDATE reviews SET review_status = $2 WHERE review_id = $1", [id, status]);
        await audit(client, actor, status === "hidden" ? "review.hide" : "review.restore", "review", id,
            { status: current.rows[0].review_status }, { status });
        await client.query("COMMIT");
        res.json({ review_id: id, status });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`POST /api/admin/reviews/${id}/status failed:`, err);
        res.status(500).json({ error: "Could not update the review. Nothing was changed." });
    } finally {
        client.release();
    }
});

router.get("/admin/trends", requireFeature("admin.trends"), async (req, res) => {
    const days = PERIODS.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    try {
        const [daily, top, noResults, totals] = await Promise.all([
            pool.query(
                `SELECT to_char(d, 'YYYY-MM-DD') AS day,
                        COALESCE(a.active_sessions, 0)::int AS active_users,
                        (SELECT COUNT(*)::int FROM search_logs s
                         WHERE s.search_created_at >= d AND s.search_created_at < d + INTERVAL '1 day') AS searches
                 FROM generate_series(current_date - ($1::int - 1), current_date, INTERVAL '1 day') d
                 LEFT JOIN v_active_users_daily a ON a.active_day = d::date
                 ORDER BY d`,
                [days]
            ),
            pool.query(
                `SELECT search_query_normalised AS query, SUM(trend_count)::int AS searches,
                        ROUND(AVG(trend_avg_results), 1) AS avg_results
                 FROM v_search_trends_daily
                 WHERE trend_day > current_date - $1::int
                 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 15`,
                [days]
            ),
            pool.query(
                `SELECT search_query_normalised AS query, SUM(trend_count)::int AS searches
                 FROM v_search_trends_daily
                 WHERE trend_day > current_date - $1::int AND trend_avg_results < 1
                 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`,
                [days]
            ),
            pool.query(
                `SELECT (SELECT COUNT(*)::int FROM search_logs WHERE search_created_at > current_date - $1::int) AS searches,
                        (SELECT COUNT(*)::int FROM vendor_profile_views WHERE view_created_at > current_date - $1::int) AS profile_views,
                        (SELECT COUNT(*)::int FROM vendors WHERE vendor_created_at > current_date - $1::int) AS new_businesses,
                        (SELECT COUNT(*)::int FROM reviews WHERE review_created_at > current_date - $1::int) AS new_reviews`,
                [days]
            ),
        ]);
        res.json({ days, totals: totals.rows[0], daily: daily.rows, top: top.rows, noResults: noResults.rows });
    } catch (err) {
        console.error("GET /api/admin/trends failed:", err);
        res.status(500).json({ error: "Could not load search trends" });
    }
});

module.exports = router;
