const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");

// Schema v2 renamed every column this file writes (title -> listing_title,
// price -> listing_price, free-text category -> category_id) and added a
// NOT NULL listing_slug that has to be generated. Inserts using the old names
// failed against the v2 database.

// Storage config for uploaded photos (local storage for now)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/filename.jpg");
    },
    filename: (req, file, cb) => {
        // Keep original extension
        const ext = file.originalname.split(".").pop();
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/jpg"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only JPG and PNG images allowed"));
        }
        cb(null, true);
    }
});

// Bengali letters are outside the ASCII range, so a Bangla title slugifies to
// an empty string. The caller falls back to a generated slug rather than
// rejecting the listing over it.
function slugify(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 180);
}

// The unique constraint is (vendor_id, listing_slug): two vendors may both
// have "silk-saree", one vendor may not have it twice.
async function uniqueSlug(vendorId, title) {
    const base = slugify(title) || `listing-${Date.now()}`;

    const { rows } = await pool.query(
        `SELECT listing_slug FROM vendor_listings
         WHERE vendor_id = $1 AND (listing_slug = $2 OR listing_slug LIKE $3)`,
        [vendorId, base, `${base}-%`]
    );

    const taken = new Set(rows.map((r) => r.listing_slug));
    if (!taken.has(base)) return base;

    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

// null when absent, undefined when unusable — the two are told apart below.
function money(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function count(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Returns an error message, or null when the body is fine.
function validate({ title, price, priceMax, minOrderQty }) {
    if (!title || !String(title).trim()) return "A name is required.";
    if (String(title).trim().length > 255) return "The name is too long.";

    if (price === undefined) return "The price must be a number, or left blank.";
    if (priceMax === undefined) return "The maximum price must be a number, or left blank.";
    if (minOrderQty === undefined) {
        return "The minimum order quantity must be a whole number above zero, or left blank.";
    }

    // Mirrors the CHECK constraint, so a bad range is a 400 not a 500.
    if (price !== null && priceMax !== null && priceMax < price) {
        return "The maximum price cannot be below the price.";
    }
    if (priceMax !== null && price === null) {
        return "A price range needs a starting price.";
    }
    return null;
}

function readBody(body) {
    return {
        title: body.listing_title ?? body.title,
        titleBn: body.listing_title_bn ?? null,
        description: body.listing_description ?? body.description ?? null,
        categoryId: count(body.category_id),
        price: money(body.listing_price ?? body.price),
        priceMax: money(body.listing_price_max),
        priceUnit: body.listing_price_unit || null,
        minOrderQty: count(body.listing_min_order_qty),
        isNegotiable: body.listing_is_negotiable === undefined
            ? true
            : Boolean(body.listing_is_negotiable),
    };
}

// create listing:

router.post("/vendors/:vendorId/listings", async (req, res) => {
    const { vendorId } = req.params;
    const fields = readBody(req.body);

    if (fields.categoryId === undefined || fields.categoryId === null) {
        return res.status(400).json({ success: false, error: "Choose a category." });
    }

    const problem = validate(fields);
    if (problem) {
        return res.status(400).json({ success: false, error: problem });
    }

    try {
        const slug = await uniqueSlug(vendorId, fields.title);

        // listing_status defaults to 'pending', so a new listing waits for
        // admin approval before the public directory picks it up.
        const result = await pool.query(
            `INSERT INTO vendor_listings
                 (vendor_id, category_id, listing_title, listing_title_bn,
                  listing_slug, listing_description, listing_price,
                  listing_price_max, listing_price_unit,
                  listing_min_order_qty, listing_is_negotiable)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING listing_id, listing_slug, listing_status`,
            [
                vendorId,
                fields.categoryId,
                String(fields.title).trim(),
                fields.titleBn,
                slug,
                fields.description,
                fields.price,
                fields.priceMax,
                fields.priceUnit,
                fields.minOrderQty,
                fields.isNegotiable,
            ]
        );

        const row = result.rows[0];
        res.status(201).json({
            success: true,
            listing_id: row.listing_id,
            listing_slug: row.listing_slug,
            listing_status: row.listing_status,
        });
    } catch (err) {
        console.error("Listing creation error:", err);

        // A bad vendor or category is the caller's mistake, not a 500.
        if (err.code === "23503") {
            return res
                .status(400)
                .json({ success: false, error: "Unknown vendor or category." });
        }
        res.status(500).json({ success: false, error: "Could not create the listing." });
    }
});

// update listing:

router.put("/listings/:listingId", async (req, res) => {
    const { listingId } = req.params;
    const fields = readBody(req.body);

    if (fields.categoryId === undefined || fields.categoryId === null) {
        return res.status(400).json({ success: false, error: "Choose a category." });
    }

    const problem = validate(fields);
    if (problem) {
        return res.status(400).json({ success: false, error: problem });
    }

    try {
        const existing = await pool.query(
            `SELECT vendor_id, listing_title FROM vendor_listings WHERE listing_id = $1`,
            [listingId]
        );
        if (existing.rowCount === 0) {
            return res.status(404).json({ success: false, error: "Listing not found." });
        }

        // Only regenerate the slug when the title changes, so editing a price
        // does not break a published link.
        const { vendor_id: vendorId, listing_title: oldTitle } = existing.rows[0];
        const renamed = String(fields.title).trim() !== oldTitle;
        const slug = renamed ? await uniqueSlug(vendorId, fields.title) : null;

        const result = await pool.query(
            `UPDATE vendor_listings SET
                 category_id = $2,
                 listing_title = $3,
                 listing_title_bn = $4,
                 listing_slug = COALESCE($5, listing_slug),
                 listing_description = $6,
                 listing_price = $7,
                 listing_price_max = $8,
                 listing_price_unit = $9,
                 listing_min_order_qty = $10,
                 listing_is_negotiable = $11,
                 listing_updated_at = NOW()
             WHERE listing_id = $1
             RETURNING listing_id, listing_slug, listing_status`,
            [
                listingId,
                fields.categoryId,
                String(fields.title).trim(),
                fields.titleBn,
                slug,
                fields.description,
                fields.price,
                fields.priceMax,
                fields.priceUnit,
                fields.minOrderQty,
                fields.isNegotiable,
            ]
        );

        const row = result.rows[0];
        res.json({
            success: true,
            listing_id: row.listing_id,
            listing_slug: row.listing_slug,
            listing_status: row.listing_status,
        });
    } catch (err) {
        console.error("Listing update error:", err);
        if (err.code === "23503") {
            return res.status(400).json({ success: false, error: "Unknown category." });
        }
        res.status(500).json({ success: false, error: "Could not update the listing." });
    }
});

// upload photos for a listing:
router.post(
    "/listings/:listingId/photos",
    (req, res, next) => {
        upload.array("photos")(req, res, function (err) {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }
            next();
        });
    },
    async (req, res) => {
        const { listingId } = req.params;

        try {
const photoFiles = req.files || [];

if (photoFiles.length === 0) {
    return res.status(400).json({
        success: false,
        error: "Choose at least one photo.",
    });
}

            const existingResult = await pool.query(
                `SELECT
                    COUNT(*)::int AS photo_count,
                    COALESCE(
                        MAX(photo_sort_order),
                        -1
                    )::int AS highest_sort_order,
                    COALESCE(
                        BOOL_OR(photo_is_primary),
                        false
                    ) AS has_primary
                FROM listing_photos
                WHERE listing_id = $1`,
                            [listingId]
                        );

            const {
                photo_count: photoCount,
                highest_sort_order: highestSortOrder,
                has_primary: hasPrimary,
            } = existingResult.rows[0];

            for (const [index, file] of photoFiles.entries()) {
                const storedPath = path
                    .relative(
                        path.resolve(__dirname, ".."),
                        file.path
                    )
                    .split(path.sep)
                    .join("/");

                const isPrimary =
                    !hasPrimary &&
                    photoCount === 0 &&
                    index === 0;

                await pool.query(
                    `INSERT INTO listing_photos (
             listing_id,
             photo_url,
             photo_alt_text,
             photo_sort_order,
             photo_is_primary
         )
         VALUES ($1, $2, $3, $4, $5)`,
                    [
                        listingId,
                        storedPath,
                        null,
                        highestSortOrder + index + 1,
                        isPrimary,
                    ]
                );
            }
            

            res.json({ success: true, message: "Photos uploaded" });
        } catch (err) {
            console.error("Photo upload error:", err);
            res.status(500).json({ success: false, error: "Could not save the photos." });
        }
    }
);

// get all listings for a vendor:
router.get("/vendors/:vendorId/listings", async (req, res) => {
    const { vendorId } = req.params;

    try {
        // Named rather than SELECT *, so a schema change surfaces here instead
        // of quietly reshaping the response.
        const result = await pool.query(
            `SELECT
         l.listing_id,
         l.vendor_id,
         l.category_id,
         l.listing_title,
         l.listing_title_bn,
         l.listing_slug,
         l.listing_description,
         l.listing_price,
         l.listing_price_max,
         l.listing_price_unit,
         l.listing_min_order_qty,
         l.listing_is_negotiable,
         l.listing_status,
         l.listing_rejection_reason,
         l.listing_created_at,
         c.category_name,
         c.category_slug,
         primary_photo.photo_url AS photo_url
     FROM vendor_listings l
     LEFT JOIN categories c
       ON c.category_id = l.category_id
     LEFT JOIN LATERAL (
         SELECT lp.photo_url
         FROM listing_photos lp
         WHERE lp.listing_id = l.listing_id
         ORDER BY
             lp.photo_is_primary DESC,
             lp.photo_sort_order,
             lp.photo_id
         LIMIT 1
     ) primary_photo ON true
     WHERE l.vendor_id = $1
     ORDER BY l.listing_id DESC`,
            [vendorId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("Listing fetch error:", err);
        res.status(500).json({ success: false, error: "Could not load the listings." });
    }
});

// delete listings:

router.delete("/listings/:listingId", async (req, res) => {
    const { listingId } = req.params;

    try {
        await pool.query(`DELETE FROM listing_photos WHERE listing_id = $1`, [listingId]);
        const result = await pool.query(
            `DELETE FROM vendor_listings WHERE listing_id = $1`,
            [listingId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: "Listing not found." });
        }
        res.json({ success: true, message: "Listing deleted" });
    } catch (err) {
        console.error("Listing delete error:", err);
        res.status(500).json({ success: false, error: "Could not delete the listing." });
    }
});


module.exports = router;
