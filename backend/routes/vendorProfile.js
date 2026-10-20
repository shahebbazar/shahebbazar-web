const express = require("express");
const pool = require("../db");
const { LIMITS, validateProfile } = require("../lib/businessProfile");
const { imageUpload, receive, discard, storedPath, checkUploads, removeUnreferencedFiles } = require("../lib/uploads");
const { requireVendorOwnership } = require("../lib/middleware/auth");
const { requireFeature } = require("../lib/access");
const { getSetting } = require("../lib/settings");
const router = express.Router();

// Add / Edit Business: the provider's own profile.

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function parseId(raw) {
    return /^\d{1,10}$/.test(raw) && Number(raw) > 0 && Number(raw) <= 2147483647 ? Number(raw) : null;
}

// Reading

async function loadProfile(db, vendorId) {
    const vendor = await db.query(
        `SELECT vendor_id, vendor_slug, vendor_name, vendor_name_bn, vendor_description,
                vendor_phone, vendor_whatsapp, vendor_email, vendor_website, vendor_address,
                location_id, vendor_logo_url, vendor_cover_url, vendor_status,
                vendor_rejection_reason
         FROM vendors WHERE vendor_id = $1`,
        [vendorId]
    );
    if (vendor.rowCount === 0) return null;

    const [categories, hours, photos, facts, social, listings] = await Promise.all([
        db.query(
            `SELECT vc.category_id FROM vendor_categories vc
             JOIN categories c ON c.category_id = vc.category_id
             WHERE vc.vendor_id = $1
             ORDER BY c.category_sort_order, c.category_id`,
            [vendorId]
        ),
        // TIME is formatted in SQL: HH:MM is what <input type="time"> takes.
        db.query(
            `SELECT hours_day_of_week AS day,
                    CASE WHEN hours_is_closed THEN 'closed'
                         WHEN hours_is_24h THEN '24h' ELSE 'open' END AS mode,
                    to_char(hours_open_time, 'HH24:MI') AS open,
                    to_char(hours_close_time, 'HH24:MI') AS close
             FROM vendor_opening_hours WHERE vendor_id = $1
             ORDER BY hours_day_of_week`,
            [vendorId]
        ),
        db.query(
            `SELECT vendor_photo_id AS id, vendor_photo_url AS url
             FROM vendor_photos WHERE vendor_id = $1
             ORDER BY vendor_photo_sort, vendor_photo_id`,
            [vendorId]
        ),
        db.query(
            `SELECT fact_label AS label, fact_value AS value, fact_group AS "group"
             FROM vendor_facts WHERE vendor_id = $1
             ORDER BY fact_group, fact_sort_order, fact_id`,
            [vendorId]
        ),
        db.query(
            `SELECT social_platform AS platform, social_url AS url
             FROM vendor_social_links WHERE vendor_id = $1`,
            [vendorId]
        ),
        db.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE listing_status = 'approved')::int AS live
             FROM vendor_listings WHERE vendor_id = $1 AND listing_status <> 'archived'`,
            [vendorId]
        ),
    ]);

    return {
        vendor: vendor.rows[0],
        category_ids: categories.rows.map((r) => r.category_id),
        hours: hours.rows,
        photos: photos.rows,
        facts: facts.rows,
        social: Object.fromEntries(social.rows.map((r) => [r.platform, r.url])),
        listings: listings.rows[0],
    };
}

async function loadOptions() {
    const [categories, areas] = await Promise.all([
        // Grouped by top-level category.
        pool.query(
            `SELECT c.category_id AS id,
                    CASE WHEN c.category_parent_id IS NULL
                         THEN c.category_name || ' (general)' ELSE c.category_name END AS name,
                    COALESCE(p.category_name, c.category_name) AS parent
             FROM categories c
             LEFT JOIN categories p ON p.category_id = c.category_parent_id
             WHERE c.category_is_active AND (p.category_id IS NULL OR p.category_is_active)
             ORDER BY COALESCE(p.category_sort_order, c.category_sort_order),
                      COALESCE(p.category_id, c.category_id),
                      c.category_parent_id IS NOT NULL, c.category_sort_order, c.category_id`
        ),
        pool.query(
            `SELECT a.location_id AS id, a.location_name AS name, city.location_name AS city
             FROM locations a
             JOIN locations city ON city.location_id = a.location_parent_id
             WHERE a.location_type = 'area'
             ORDER BY city.location_name, a.location_name`
        ),
    ]);
    return { categories: categories.rows, areas: areas.rows };
}

router.get(
    "/vendors/:vendorId/profile",
    requireFeature("business.profile"), requireVendorOwnership,
    async (req, res) => {
        const vendorId =
            req.user.user_role === "admin"
                ? parseId(req.params.vendorId)
                : req.vendor.vendor_id;
        if (vendorId === null) return res.status(400).json({ error: "Invalid vendor id" });

        try {
            const [profile, options] = await Promise.all([loadProfile(pool, vendorId), loadOptions()]);
            if (!profile) return res.status(404).json({ error: "Vendor not found" });
            res.json({ ...profile, options, limits: LIMITS });
        } catch (err) {
            console.error(`GET /api/vendors/${vendorId}/profile failed:`, err);
            res.status(500).json({ error: "Could not load the business" });
        }
    }
);

// Saving

/** Sets vendor_cover_url to the first photo, or NULL when there is none. */
async function syncCover(db, vendorId) {
    await db.query(
        `UPDATE vendors SET vendor_cover_url = (
             SELECT vendor_photo_url FROM vendor_photos WHERE vendor_id = $1
             ORDER BY vendor_photo_sort, vendor_photo_id LIMIT 1
         )
         WHERE vendor_id = $1`,
        [vendorId]
    );
}

// PUT /api/vendors/:id/profile: saves the form; 400 carries field errors, 409 means the business is suspended.
router.put(
    "/vendors/:vendorId/profile",
    requireFeature("business.profile"), requireVendorOwnership,
    async (req, res) => {
        const vendorId =
            req.user.user_role === "admin"
                ? parseId(req.params.vendorId)
                : req.vendor.vendor_id;
        if (vendorId === null) return res.status(400).json({ error: "Invalid vendor id" });

        const { errors, value } = validateProfile(req.body);

        const client = await pool.connect();
        try {
            // Checks that need the database.
            if (value.categoryIds.length > 0) {
                const found = await client.query(
                    `SELECT COUNT(*)::int AS n FROM categories
                 WHERE category_id = ANY($1::int[]) AND category_is_active`,
                    [value.categoryIds]
                );
                if (found.rows[0].n !== value.categoryIds.length) errors.category_ids = "Choose categories from the list.";
            }
            if (value.locationId !== null) {
                const area = await client.query(
                    `SELECT 1 FROM locations WHERE location_id = $1 AND location_type = 'area'`,
                    [value.locationId]
                );
                if (area.rowCount === 0) errors.location_id = "Choose an area from the list.";
            }

            if (Object.keys(errors).length > 0) {
                return res.status(400).json({ error: "Some fields need attention.", errors });
            }

            await client.query("BEGIN");

            // FOR UPDATE: two saves of the same business run one after the other.
            const current = await client.query(
                "SELECT vendor_status FROM vendors WHERE vendor_id = $1 FOR UPDATE",
                [vendorId]
            );
            if (current.rowCount === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Vendor not found" });
            }
            const status = current.rows[0].vendor_status;
            if (status === "suspended") {
                await client.query("ROLLBACK");
                return res.status(409).json({ error: "This business is suspended and cannot be edited. Contact support." });
            }

            const submitting = value.submit && (status === "draft" || status === "rejected");
            // With business approval switched off (KAN-293), submitting publishes it at once.
            const submittedStatus = submitting && !(await getSetting(client, "require_business_approval")) ? "approved" : "pending";

            await client.query(
                `UPDATE vendors SET
                 vendor_name = $2, vendor_name_bn = $3, location_id = $4, vendor_address = $5,
                 vendor_phone = $6, vendor_whatsapp = $7, vendor_description = $8,
                 vendor_email = $9, vendor_website = $10,
                 vendor_status = CASE WHEN $11 THEN $12::text ELSE vendor_status END,
                 vendor_verified_at = CASE WHEN $11 AND $12::text = 'approved' THEN NOW() ELSE vendor_verified_at END,
                 vendor_rejection_reason = CASE WHEN $11 THEN NULL ELSE vendor_rejection_reason END,
                 vendor_updated_at = NOW()
             WHERE vendor_id = $1`,
                [
                    vendorId, value.name, value.nameBn, value.locationId, value.address,
                    value.phone, value.whatsapp, value.description, value.email, value.website,
                    submitting, submittedStatus,
                ]
            );

            await client.query("DELETE FROM vendor_categories WHERE vendor_id = $1", [vendorId]);
            await client.query(
                `INSERT INTO vendor_categories (vendor_id, category_id)
             SELECT $1, unnest($2::int[])`,
                [vendorId, value.categoryIds]
            );

            // Hours: days left unset have no row, which the site shows as "hours not listed" rather than closed.
            await client.query("DELETE FROM vendor_opening_hours WHERE vendor_id = $1", [vendorId]);
            for (const h of value.hours) {
                await client.query(
                    `INSERT INTO vendor_opening_hours
                     (vendor_id, hours_day_of_week, hours_open_time, hours_close_time,
                      hours_is_closed, hours_is_24h)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                    [vendorId, h.day, h.open, h.close, h.mode === "closed", h.mode === "24h"]
                );
            }

            // Facts: an icon chosen in the seed data is kept when the same label is saved again in the same place.
            const oldIcons = await client.query(
                "SELECT fact_group, lower(fact_label) AS label, fact_icon FROM vendor_facts WHERE vendor_id = $1",
                [vendorId]
            );
            const iconOf = new Map(oldIcons.rows.map((r) => [`${r.fact_group}|${r.label}`, r.fact_icon]));
            await client.query("DELETE FROM vendor_facts WHERE vendor_id = $1", [vendorId]);
            for (const [i, f] of value.facts.entries()) {
                await client.query(
                    `INSERT INTO vendor_facts (vendor_id, fact_group, fact_label, fact_value, fact_icon, fact_sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                    [vendorId, f.group, f.label, f.value, iconOf.get(`${f.group}|${f.label.toLowerCase()}`) ?? null, i]
                );
            }

            await client.query("DELETE FROM vendor_social_links WHERE vendor_id = $1", [vendorId]);
            for (const s of value.social) {
                await client.query(
                    "INSERT INTO vendor_social_links (vendor_id, social_platform, social_url) VALUES ($1, $2, $3)",
                    [vendorId, s.platform, s.url]
                );
            }

            // Photo order: renumbered 0..n-1 on every save.
            await client.query(
                `WITH ranked AS (
                 SELECT p.vendor_photo_id,
                        ROW_NUMBER() OVER (ORDER BY o.ord NULLS LAST, p.vendor_photo_sort, p.vendor_photo_id) - 1 AS rn
                 FROM vendor_photos p
                 LEFT JOIN unnest($2::int[]) WITH ORDINALITY AS o(id, ord) ON o.id = p.vendor_photo_id
                 WHERE p.vendor_id = $1
             )
             UPDATE vendor_photos p SET vendor_photo_sort = r.rn
             FROM ranked r WHERE p.vendor_photo_id = r.vendor_photo_id`,
                [vendorId, value.photoOrder]
            );
            await syncCover(client, vendorId);

            await client.query("COMMIT");

            const saved = await loadProfile(pool, vendorId);
            res.json(saved);
        } catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            console.error(`PUT /api/vendors/${vendorId}/profile failed:`, err);
            res.status(500).json({ error: "Could not save the business. Nothing was changed." });
        } finally {
            client.release();
        }
    }
);

// Images

// Upload handling (limits, generated names, image checks, cleanup) lives in lib/uploads.js.
const vendorFilePrefix = (req) => `vendor-${req.params.vendorId}`;
// Ownership is checked before multer runs, so a refused request never writes a file.
const ownerAccess = [requireFeature("business.profile"), requireVendorOwnership];

router.post("/vendors/:vendorId/logo", ...ownerAccess, receive(imageUpload("logo", LOGO_MAX_BYTES, 1, vendorFilePrefix), "2 MB"), async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (!(await checkUploads(req, res))) return;

    try {
        const result = await pool.query(
            `UPDATE vendors v SET vendor_logo_url = $2, vendor_updated_at = NOW()
             FROM (SELECT vendor_logo_url AS old_url FROM vendors WHERE vendor_id = $1) before
             WHERE v.vendor_id = $1
             RETURNING v.vendor_logo_url, before.old_url`,
            [vendorId, storedPath(req.files[0])]
        );
        if (result.rowCount === 0) {
            await discard(req.files);
            return res.status(404).json({ error: "Vendor not found" });
        }
        await removeUnreferencedFiles(pool, [result.rows[0].old_url]);
        res.status(201).json({ logo_url: result.rows[0].vendor_logo_url });
    } catch (err) {
        await discard(req.files);
        console.error(`POST /api/vendors/${vendorId}/logo failed:`, err);
        res.status(500).json({ error: "Could not save the logo." });
    }
});

// A removed or replaced file is deleted only when no listing photo, business photo, logo or cover
// still uses it (seed data can share paths); see removeUnreferencedFiles.
router.delete("/vendors/:vendorId/logo", ...ownerAccess, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    if (vendorId === null) return res.status(400).json({ error: "Invalid vendor id" });
    try {
        const result = await pool.query(
            `UPDATE vendors v SET vendor_logo_url = NULL, vendor_updated_at = NOW()
             FROM (SELECT vendor_logo_url AS old_url FROM vendors WHERE vendor_id = $1) before
             WHERE v.vendor_id = $1
             RETURNING before.old_url`,
            [vendorId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: "Vendor not found" });
        await removeUnreferencedFiles(pool, [result.rows[0].old_url]);
        res.status(204).end();
    } catch (err) {
        console.error(`DELETE /api/vendors/${vendorId}/logo failed:`, err);
        res.status(500).json({ error: "Could not remove the logo." });
    }
});

router.post(
    "/vendors/:vendorId/photos",
    ...ownerAccess,
    receive(imageUpload("photos", PHOTO_MAX_BYTES, LIMITS.photosMax, vendorFilePrefix), "5 MB"),
    async (req, res) => {
        const vendorId = parseId(req.params.vendorId);
        if (!(await checkUploads(req, res))) return;

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const vendor = await client.query(
                "SELECT vendor_name FROM vendors WHERE vendor_id = $1 FOR UPDATE",
                [vendorId]
            );
            if (vendor.rowCount === 0) {
                await client.query("ROLLBACK");
                await discard(req.files);
                return res.status(404).json({ error: "Vendor not found" });
            }

            const count = await client.query(
                "SELECT COUNT(*)::int AS n, COALESCE(MAX(vendor_photo_sort), -1) AS last FROM vendor_photos WHERE vendor_id = $1",
                [vendorId]
            );
            const { n, last } = count.rows[0];
            if (n + req.files.length > LIMITS.photosMax) {
                await client.query("ROLLBACK");
                await discard(req.files);
                const left = LIMITS.photosMax - n;
                return res.status(400).json({
                    error: left > 0
                        ? `You can add ${left} more photo${left === 1 ? "" : "s"} (up to ${LIMITS.photosMax} in total).`
                        : `You already have ${LIMITS.photosMax} photos. Remove one to add another.`,
                });
            }

            for (const [i, file] of req.files.entries()) {
                await client.query(
                    `INSERT INTO vendor_photos (vendor_id, vendor_photo_url, vendor_photo_alt, vendor_photo_sort)
                     VALUES ($1, $2, $3, $4)`,
                    [vendorId, storedPath(file), `${vendor.rows[0].vendor_name} photo`, last + 1 + i]
                );
            }
            await syncCover(client, vendorId);
            await client.query("COMMIT");

            const photos = await pool.query(
                `SELECT vendor_photo_id AS id, vendor_photo_url AS url FROM vendor_photos
                 WHERE vendor_id = $1 ORDER BY vendor_photo_sort, vendor_photo_id`,
                [vendorId]
            );
            res.status(201).json({ photos: photos.rows });
        } catch (err) {
            await client.query("ROLLBACK").catch(() => { });
            await discard(req.files);
            console.error(`POST /api/vendors/${vendorId}/photos failed:`, err);
            res.status(500).json({ error: "Could not save the photos." });
        } finally {
            client.release();
        }
    }
);

router.delete("/vendors/:vendorId/photos/:photoId", ...ownerAccess, async (req, res) => {
    const vendorId = parseId(req.params.vendorId);
    const photoId = parseId(req.params.photoId);
    if (vendorId === null || photoId === null) return res.status(400).json({ error: "Invalid id" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const removed = await client.query(
            "DELETE FROM vendor_photos WHERE vendor_photo_id = $1 AND vendor_id = $2 RETURNING vendor_photo_url",
            [photoId, vendorId]
        );
        if (removed.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Photo not found" });
        }
        await syncCover(client, vendorId);
        await client.query("COMMIT");
        await removeUnreferencedFiles(pool, [removed.rows[0].vendor_photo_url]);
        res.status(204).end();
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        console.error(`DELETE /api/vendors/${vendorId}/photos/${photoId} failed:`, err);
        res.status(500).json({ error: "Could not remove the photo." });
    } finally {
        client.release();
    }
});

module.exports = router;
