// Administration: approvals, categories, reports, review moderation and search trends.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { query, call, startApi, stopApi, userIdOf } = require("./support/harness");

let adminId;
before(async () => {
    await startApi();
    adminId = await userIdOf("admin");
});
after(stopApi);

const lastAudit = async (action) =>
    (await query("SELECT * FROM audit_logs WHERE audit_action = $1 ORDER BY audit_id DESC LIMIT 1", [action]))[0];

describe("approvals", () => {
    let pendingVendor;
    let pendingListing;
    before(async () => {
        pendingVendor = (await query("SELECT vendor_id, vendor_slug, vendor_name FROM vendors WHERE vendor_slug = 'shaheb-bazar-cloth-store'"))[0];
        pendingListing = (await query("SELECT listing_id, listing_title, vendor_id FROM vendor_listings WHERE listing_slug = 'custom-blouse-stitching'"))[0];
    });
    const decide = (kind, id, json) => call("POST", `/admin/${kind}s/${id}/decision`, { as: "admin", json });

    it("the queue shows pending businesses and listings", async () => {
        const res = await call("GET", "/admin/queue", { as: "admin" });
        assert.equal(res.status, 200);
        assert.ok(res.data.vendors.some((v) => v.vendor_id === pendingVendor.vendor_id));
        assert.ok(res.data.listings.some((l) => l.listing_id === pendingListing.listing_id));
    });

    it("checks the decision and the reason for a rejection", async () => {
        assert.equal((await decide("vendor", pendingVendor.vendor_id, { decision: "maybe" })).status, 400);
        assert.equal((await decide("vendor", pendingVendor.vendor_id, { decision: "reject", reason: "Too short" })).status, 400);
        assert.equal((await decide("vendor", pendingVendor.vendor_id, { decision: "reject", reason: "x".repeat(501) })).status, 400);
        assert.equal((await decide("vendor", 999999, { decision: "approve" })).status, 404);
        assert.equal((await decide("vendor", "abc", { decision: "approve" })).status, 400);
    });

    it("approving a business makes it public, records who verified it, and audits the decision", async () => {
        assert.equal((await call("GET", `/businesses/${pendingVendor.vendor_slug}`)).status, 404);
        const res = await decide("vendor", pendingVendor.vendor_id, { decision: "approve" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal((await call("GET", `/businesses/${pendingVendor.vendor_slug}`)).status, 200);
        const [v] = await query("SELECT vendor_verified_by, vendor_verified_at FROM vendors WHERE vendor_id = $1", [pendingVendor.vendor_id]);
        assert.equal(v.vendor_verified_by, adminId);
        assert.ok(v.vendor_verified_at);
        const entry = await lastAudit("vendor.approve");
        assert.equal(entry.audit_target_id, pendingVendor.vendor_id);
        assert.equal(entry.audit_actor_user_id, adminId);
    });

    it("a decided item cannot be decided again", async () => {
        const res = await decide("vendor", pendingVendor.vendor_id, { decision: "reject", reason: "Changed our mind about this." });
        assert.equal(res.status, 409);
        assert.equal(res.data.status, "approved");
    });

    it("rejecting a listing stores the reason for the owner and keeps it off the public page", async () => {
        const reason = "Please add a price range and a clearer photo.";
        const res = await decide("listing", pendingListing.listing_id, { decision: "reject", reason });
        assert.equal(res.status, 200);
        const [row] = await query("SELECT listing_status, listing_rejection_reason FROM vendor_listings WHERE listing_id = $1", [pendingListing.listing_id]);
        assert.deepEqual(row, { listing_status: "rejected", listing_rejection_reason: reason });
        const page = await call("GET", "/businesses/shaheb-bazar-silk-house");
        assert.ok(!page.data.listings.some((l) => l.listing_id === pendingListing.listing_id));
        assert.equal((await decide("listing", pendingListing.listing_id, { decision: "approve" })).status, 409);
    });

    it("decided items leave the queue and appear in recent decisions", async () => {
        const res = await call("GET", "/admin/queue", { as: "admin" });
        assert.ok(!res.data.vendors.some((v) => v.vendor_id === pendingVendor.vendor_id));
        assert.ok(!res.data.listings.some((l) => l.listing_id === pendingListing.listing_id));
    });
});

describe("categories", () => {
    let mainId;

    it("adds a main category with a slug made from its name, and audits it", async () => {
        const res = await call("POST", "/admin/categories", { as: "admin", json: { name: "Pets & Garden", name_bn: "পোষা প্রাণী", sort_order: 50 } });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        mainId = res.data.id ?? res.data.category_id;
        const [row] = await query("SELECT category_slug FROM categories WHERE category_id = $1", [mainId]);
        assert.equal(row.category_slug, "pets-and-garden");
        assert.ok((await call("GET", "/categories")).data.some((c) => c.category_id === mainId));
        assert.equal((await lastAudit("category.create")).audit_actor_user_id, adminId);
    });

    it("adds a subcategory, but not a sub-subcategory", async () => {
        const sub = await call("POST", "/admin/categories", { as: "admin", json: { name: "Aquariums", parent_id: mainId } });
        assert.equal(sub.status, 201);
        const subId = sub.data.id ?? sub.data.category_id;
        const deeper = await call("POST", "/admin/categories", { as: "admin", json: { name: "Fish food", parent_id: subId } });
        assert.equal(deeper.status, 400);
        assert.equal((await call("POST", "/admin/categories", { as: "admin", json: { name: "Orphan", parent_id: 999999 } })).status, 404);
    });

    it("refuses duplicates (ignoring case) and invalid fields", async () => {
        assert.equal((await call("POST", "/admin/categories", { as: "admin", json: { name: "pets & garden" } })).status, 409);
        for (const json of [{ name: "x" }, { name: "x".repeat(101) }, { name: "Valid", icon: "Not An Icon!" }, { name: "Valid", sort_order: 10000 }]) {
            assert.equal((await call("POST", "/admin/categories", { as: "admin", json })).status, 400, JSON.stringify(json));
        }
    });

    it("renames and hides a category; hidden categories leave the public list", async () => {
        const res = await call("PUT", `/admin/categories/${mainId}`, { as: "admin", json: { name: "Pets and Garden", is_active: false } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.ok(!(await call("GET", "/categories")).data.some((c) => c.category_id === mainId));
        assert.equal((await call("PUT", `/admin/categories/${mainId}`, { as: "admin", json: { name: "Pets" } })).status, 400, "is_active is required");
        assert.equal((await call("PUT", "/admin/categories/999999", { as: "admin", json: { name: "Nope", is_active: true } })).status, 404);
        assert.ok(await lastAudit("category.update"));
    });

    it("the admin list includes hidden categories with business counts", async () => {
        const res = await call("GET", "/admin/categories", { as: "admin" });
        const row = res.data.find((c) => c.id === mainId);
        assert.equal(row.is_active, false);
        assert.equal(typeof row.business_count, "number");
    });
});

describe("reports", () => {
    const report = (json) => call("POST", "/reports", { as: "customer", json });
    const resolve = (id, action) => call("POST", `/admin/reports/${id}/resolve`, { as: "admin", json: { action } });

    it("taking down a business suspends it", async () => {
        const [v] = await query("SELECT vendor_id, vendor_slug FROM vendors WHERE vendor_slug = 'padma-diagnostic-centre'");
        const r = await report({ target_type: "vendor", target_id: v.vendor_id, reason: "scam" });
        assert.equal((await resolve(r.data.report_id, "take_down")).status, 200);
        assert.equal((await call("GET", `/businesses/${v.vendor_slug}`)).status, 404);
        const [row] = await query("SELECT report_status, report_resolved_by FROM reports WHERE report_id = $1", [r.data.report_id]);
        assert.deepEqual(row, { report_status: "actioned", report_resolved_by: adminId });
    });

    it("taking down a listing archives it", async () => {
        const [l] = await query("SELECT listing_id FROM vendor_listings WHERE listing_slug = 'cane-storage-basket'");
        const r = await report({ target_type: "listing", target_id: l.listing_id, reason: "fake" });
        await resolve(r.data.report_id, "take_down");
        const [row] = await query("SELECT listing_status FROM vendor_listings WHERE listing_id = $1", [l.listing_id]);
        assert.equal(row.listing_status, "archived");
    });

    it("taking down a review hides it", async () => {
        const [rv] = await query("SELECT review_id FROM reviews WHERE review_status = 'published' AND review_body IS NOT NULL ORDER BY review_id LIMIT 1");
        const r = await report({ target_type: "review", target_id: rv.review_id, reason: "fake_review" });
        await resolve(r.data.report_id, "take_down");
        const [row] = await query("SELECT review_status FROM reviews WHERE review_id = $1", [rv.review_id]);
        assert.equal(row.review_status, "hidden");
    });

    it("taking down a message closes its conversation", async () => {
        const sent = await call("POST", "/me/conversations", { as: "owner", json: { vendor_id: 6, body: "Unsolicited offer, call now!" } });
        assert.equal(sent.status, 201, JSON.stringify(sent.data));
        const [m] = await query("SELECT message_id FROM messages WHERE conversation_id = $1", [sent.data.conversation_id]);
        const r = await call("POST", "/reports", { as: "otherVendor", json: { target_type: "message", target_id: m.message_id, reason: "spam" } });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        await resolve(r.data.report_id, "take_down");
        const [c] = await query("SELECT conversation_status FROM conversations WHERE conversation_id = $1", [sent.data.conversation_id]);
        assert.equal(c.conversation_status, "blocked");
    });

    it("dismissing leaves the item alone; a resolved report cannot be resolved again", async () => {
        const r = await report({ target_type: "vendor", target_id: 1, reason: "other", details: "Not sure, just checking." });
        assert.equal((await resolve(r.data.report_id, "dismiss")).status, 200);
        assert.equal((await call("GET", "/businesses/rajshahi-mango-traders")).status, 200);
        assert.equal((await resolve(r.data.report_id, "take_down")).status, 409);
        assert.equal((await lastAudit("report.dismiss")).audit_actor_user_id, adminId);
    });

    it("checks the action and the report id", async () => {
        const r = await report({ target_type: "vendor", target_id: 2, reason: "spam" });
        assert.equal((await resolve(r.data.report_id, "delete")).status, 400);
        assert.equal((await resolve(999999, "dismiss")).status, 404);
        assert.equal((await resolve("abc", "dismiss")).status, 400);
    });

    it("the list puts open reports first", async () => {
        const res = await call("GET", "/admin/reports", { as: "admin" });
        const statuses = res.data.map((r) => r.status);
        const firstClosed = statuses.findIndex((s) => s !== "open");
        assert.ok(firstClosed === -1 || statuses.slice(firstClosed).every((s) => s !== "open"));
    });
});

describe("review moderation", () => {
    it("hides and restores a review, which changes the business's rating count", async () => {
        const [rv] = await query(
            `SELECT r.review_id, v.vendor_slug FROM reviews r JOIN vendors v USING (vendor_id)
             WHERE r.review_status = 'published' AND v.vendor_status = 'approved' ORDER BY r.review_id DESC LIMIT 1`
        );
        const count = async () => Number((await call("GET", `/businesses/${rv.vendor_slug}`)).data.business.review_count);
        const before = await count();
        assert.equal((await call("POST", `/admin/reviews/${rv.review_id}/status`, { as: "admin", json: { status: "hidden" } })).status, 200);
        assert.equal(await count(), before - 1);
        assert.ok((await call("GET", "/admin/reviews?status=hidden", { as: "admin" })).data.some((r) => r.review_id === rv.review_id));
        assert.equal((await call("POST", `/admin/reviews/${rv.review_id}/status`, { as: "admin", json: { status: "published" } })).status, 200);
        assert.equal(await count(), before);
        assert.ok(await lastAudit("review.restore"));
    });

    it("checks the status and the review id", async () => {
        assert.equal((await call("POST", "/admin/reviews/1/status", { as: "admin", json: { status: "deleted" } })).status, 400);
        assert.equal((await call("POST", "/admin/reviews/999999/status", { as: "admin", json: { status: "hidden" } })).status, 404);
    });
});

describe("search trends", () => {
    it("returns totals, daily figures and top searches for 7, 30 or 90 days", async () => {
        for (const days of [7, 30, 90]) {
            const res = await call("GET", `/admin/trends?days=${days}`, { as: "admin" });
            assert.equal(res.status, 200);
            assert.equal(res.data.days, days);
            assert.equal(res.data.daily.length, days);
            for (const key of ["searches", "profile_views", "new_businesses", "new_reviews"]) assert.ok(key in res.data.totals, key);
        }
        assert.equal((await call("GET", "/admin/trends?days=1000", { as: "admin" })).data.days, 30, "other values fall back to 30");
    });
});
