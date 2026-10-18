const express = require("express");
const pool = require("../db");
const { parseId, cleanText } = require("../lib/currentUser");

// Every /admin route needs a signed-in admin (see index.js); audit entries record that admin.

const router = express.Router();
const NAME_MAX = 100;

// Turns an English name into a URL slug, e.g. "Food & Drink" -> "food-and-drink".
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "category";
}

// Validates the editable fields; returns { error } or the cleaned values.
function parseFields(body) {
    const name = cleanText(body?.name) ?? "";
    const nameBn = cleanText(body?.name_bn) || null;
    const icon = cleanText(body?.icon) || null;
    const sortOrder = body?.sort_order === undefined || body.sort_order === "" ? 0 : Number(body.sort_order);
    if (name.length < 2 || name.length > NAME_MAX) return { error: `Enter an English name (2 to ${NAME_MAX} characters).` };
    if (nameBn && nameBn.length > NAME_MAX) return { error: `Keep the Bangla name under ${NAME_MAX} characters.` };
    if (icon && !/^[a-z-]{1,64}$/.test(icon)) return { error: "Choose an icon from the list." };
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return { error: "Order must be a whole number from 0 to 9999." };
    return { name, nameBn, icon, sortOrder };
}

// True when another category under the same parent already has this name.
async function nameTaken(db, parentId, name, exceptId = null) {
    const result = await db.query(
        `SELECT 1 FROM categories
         WHERE category_parent_id IS NOT DISTINCT FROM $1 AND lower(category_name) = lower($2)
           AND category_id IS DISTINCT FROM $3`,
        [parentId, name, exceptId]
    );
    return result.rowCount > 0;
}

// Writes one audit_logs entry for a category change.
function audit(db, actor, action, id, before, after) {
    return db.query(
        `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
         VALUES ($1, $2, 'category', $3, $4, $5)`,
        [actor, action, id, before ? JSON.stringify(before) : null, JSON.stringify(after)]
    );
}

const SELECT_CATEGORY = `
    SELECT c.category_id AS id, c.category_parent_id AS parent_id, c.category_name AS name,
           c.category_name_bn AS name_bn, c.category_slug AS slug, c.category_icon AS icon,
           c.category_sort_order AS sort_order, c.category_is_active AS is_active,
           (SELECT COUNT(DISTINCT vc.vendor_id)::int FROM vendor_categories vc
            JOIN categories c2 ON c2.category_id = vc.category_id
            WHERE c2.category_id = c.category_id OR c2.category_parent_id = c.category_id) AS business_count
    FROM categories c`;

router.get("/admin/categories", async (req, res) => {
    try {
        const result = await pool.query(`${SELECT_CATEGORY} ORDER BY c.category_sort_order, c.category_name`);
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/admin/categories failed:", err);
        res.status(500).json({ error: "Could not load categories" });
    }
});

router.post("/admin/categories", async (req, res) => {
    const fields = parseFields(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });
    const parentId = req.body?.parent_id == null || req.body.parent_id === "" ? null : parseId(req.body.parent_id);
    if (req.body?.parent_id && !parentId) return res.status(400).json({ error: "Invalid main category." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        if (parentId) {
            const parent = await client.query("SELECT category_parent_id FROM categories WHERE category_id = $1", [parentId]);
            if (parent.rowCount === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Main category not found." });
            }
            if (parent.rows[0].category_parent_id !== null) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Subcategories can only go under a main category." });
            }
        }

        if (await nameTaken(client, parentId, fields.name)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "A category with that name already exists here." });
        }

        const base = slugify(fields.name);
        const taken = await client.query(
            "SELECT category_slug FROM categories WHERE category_slug = $1 OR category_slug LIKE $1 || '-%'",
            [base]
        );
        const used = new Set(taken.rows.map((r) => r.category_slug));
        let slug = base;
        for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

        const inserted = await client.query(
            `INSERT INTO categories (category_parent_id, category_name, category_name_bn, category_slug, category_icon, category_sort_order)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING category_id`,
            [parentId, fields.name, fields.nameBn, slug, fields.icon, fields.sortOrder]
        );
        const id = inserted.rows[0].category_id;
        await audit(client, req.user.user_id, "category.create", id, null, { ...fields, parentId, slug });
        await client.query("COMMIT");
        const created = await pool.query(`${SELECT_CATEGORY} WHERE c.category_id = $1`, [id]);
        res.status(201).json(created.rows[0]);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err.code === "23505") return res.status(409).json({ error: "A category with that name already exists here." });
        console.error("POST /api/admin/categories failed:", err);
        res.status(500).json({ error: "Could not add the category. Nothing was changed." });
    } finally {
        client.release();
    }
});

router.put("/admin/categories/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const fields = parseFields(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });
    if (typeof req.body?.is_active !== "boolean") return res.status(400).json({ error: "is_active must be true or false" });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query(
            `SELECT category_parent_id, category_name, category_name_bn, category_icon, category_sort_order, category_is_active
             FROM categories WHERE category_id = $1 FOR UPDATE`,
            [id]
        );
        if (current.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Category not found" });
        }
        if (await nameTaken(client, current.rows[0].category_parent_id, fields.name, id)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "A category with that name already exists here." });
        }
        await client.query(
            `UPDATE categories
             SET category_name = $2, category_name_bn = $3, category_icon = $4,
                 category_sort_order = $5, category_is_active = $6
             WHERE category_id = $1`,
            [id, fields.name, fields.nameBn, fields.icon, fields.sortOrder, req.body.is_active]
        );
        await audit(client, req.user.user_id, "category.update", id, current.rows[0], {
            ...fields,
            is_active: req.body.is_active,
        });
        await client.query("COMMIT");
        const updated = await pool.query(`${SELECT_CATEGORY} WHERE c.category_id = $1`, [id]);
        res.json(updated.rows[0]);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err.code === "23505") return res.status(409).json({ error: "A category with that name already exists here." });
        console.error(`PUT /api/admin/categories/${id} failed:`, err);
        res.status(500).json({ error: "Could not save the category. Nothing was changed." });
    } finally {
        client.release();
    }
});

module.exports = router;
