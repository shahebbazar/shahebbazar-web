// Admin settings (KAN-293): approval of new businesses and new listings can be switched off.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PHONES, ROLES, query, call, signIn, startApi, stopApi, userIdOf } = require("./support/harness");

const setting = (key, value) => call("PUT", `/admin/settings/${key}`, { as: "admin", json: { value } });
const register = (name) =>
    call("POST", "/auth/register/vendor", { as: "applicant", json: { vendor_name: name, vendor_phone: "01722000098", vendor_city: "Rajshahi" } });
const lastAudit = async (action) =>
    (await query("SELECT * FROM audit_logs WHERE audit_action = $1 ORDER BY audit_id DESC LIMIT 1", [action]))[0];
const newListing = (title) =>
    call("POST", "/vendors/1/listings", { as: "owner", json: { listing_title: title, category_id: 1 } });

before(async () => {
    await startApi();
    PHONES.applicant = "+8801722000002";
    ROLES.applicant = "customer";
    await signIn("applicant");
});
after(stopApi);

describe("defaults", () => {
    it("both approvals start on, the free plan has one email a month, and the admin page shows what is waiting", async () => {
        const res = await call("GET", "/admin/settings", { as: "admin" });
        assert.equal(res.status, 200);
        assert.deepEqual(res.data.settings.map((s) => [s.key, s.value]), [
            ["require_business_approval", true],
            ["require_listing_approval", true],
            ["free_marketing_emails_per_month", 1],
        ]);
        assert.deepEqual(res.data.settings.map((s) => s.group), ["approval", "approval", "marketing"]);
        assert.ok(res.data.settings.every((s) => s.label && s.help));
        assert.equal(typeof res.data.waiting.businesses, "number");
        assert.equal(typeof res.data.waiting.listings, "number");
    });

    it("the public summary says approval is needed", async () => {
        const res = await call("GET", "/settings/public");
        assert.deepEqual(res.data, { require_business_approval: true, require_listing_approval: true });
    });
});

describe("with approval on (as before)", () => {
    it("a new business waits for an admin and is not public", async () => {
        const res = await register("Approval On Bakery");
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.vendor.vendor_status, "pending");
        assert.match(res.data.message, /once an administrator approves it/);
        assert.equal((await call("GET", `/businesses/${res.data.vendor.vendor_slug}`)).status, 404);
    });

    it("a new listing waits for an admin", async () => {
        const res = await newListing("Approval On Mangoes");
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.listing_status, "pending");
    });
});

describe("changing a setting", () => {
    it("refuses an unknown setting or a value that is not true or false", async () => {
        assert.equal((await setting("require_everything", false)).status, 404);
        assert.equal((await setting("require_business_approval", "no")).status, 400);
        assert.equal((await setting("require_business_approval", null)).status, 400);
        assert.equal((await call("GET", "/settings/public")).data.require_business_approval, true, "unchanged");
    });

    it("only admins can read or change settings", async () => {
        assert.equal((await call("GET", "/admin/settings")).status, 401);
        assert.equal((await call("PUT", "/admin/settings/require_business_approval", { as: "owner", json: { value: false } })).status, 403);
        assert.equal((await call("GET", "/settings/public")).data.require_business_approval, true, "unchanged");
    });

    it("switching business approval off is recorded against the admin, and leaves waiting businesses waiting", async () => {
        const waitingBefore = (await call("GET", "/admin/settings", { as: "admin" })).data.waiting.businesses;
        const res = await setting("require_business_approval", false);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.setting.value, false);
        assert.ok(res.data.setting.updated_by);
        assert.equal(res.data.waiting.businesses, waitingBefore, "nothing already waiting was approved");
        const audit = await lastAudit("setting.update");
        assert.equal(audit.audit_actor_user_id, await userIdOf("admin"));
        assert.deepEqual([audit.audit_before, audit.audit_after], [
            { key: "require_business_approval", value: true },
            { key: "require_business_approval", value: false },
        ]);
        assert.equal((await call("GET", "/settings/public")).data.require_business_approval, false);
    });
});

describe("with approval off", () => {
    it("a new business is public at once, and the automatic approval is in the audit log", async () => {
        const res = await register("Approval Off Bakery");
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.vendor.vendor_status, "approved");
        assert.match(res.data.message, /public now/);
        const [vendor] = await query("SELECT vendor_verified_at FROM vendors WHERE vendor_id = $1", [res.data.vendor.vendor_id]);
        assert.ok(vendor.vendor_verified_at);
        assert.equal((await call("GET", `/businesses/${res.data.vendor.vendor_slug}`)).status, 200);
        const audit = await lastAudit("vendor.auto_approve");
        assert.equal(audit.audit_target_id, res.data.vendor.vendor_id);
        assert.equal(audit.audit_actor_user_id, await userIdOf("applicant"));
    });

    it("a rejected business that is resubmitted is public at once", async () => {
        await query("UPDATE vendors SET vendor_status = 'rejected', vendor_rejection_reason = 'Add a description' WHERE vendor_id = 6");
        try {
            const p = (await call("GET", "/vendors/6/profile", { as: "otherVendor" })).data;
            const form = {
                name: p.vendor.vendor_name, name_bn: p.vendor.vendor_name_bn ?? "", category_ids: p.category_ids,
                location_id: p.vendor.location_id, address: p.vendor.vendor_address, phone: p.vendor.vendor_phone,
                whatsapp: p.vendor.vendor_whatsapp ?? "", description: p.vendor.vendor_description,
                email: p.vendor.vendor_email ?? "", website: p.vendor.vendor_website ?? "",
                facts: p.facts, social: p.social, hours: p.hours, photo_order: p.photos.map((ph) => ph.id), submit: true,
            };
            const res = await call("PUT", "/vendors/6/profile", { as: "otherVendor", json: form });
            assert.equal(res.status, 200, JSON.stringify(res.data));
            assert.equal(res.data.vendor.vendor_status, "approved");
        } finally {
            await query("UPDATE vendors SET vendor_status = 'approved', vendor_rejection_reason = NULL WHERE vendor_id = 6");
        }
    });

    it("listing approval is separate: new listings still wait until it is switched off too", async () => {
        assert.equal((await newListing("Still Waiting Mangoes")).data.listing_status, "pending");
        assert.equal((await setting("require_listing_approval", false)).status, 200);
        const res = await newListing("Approval Off Mangoes");
        assert.equal(res.status, 201, JSON.stringify(res.data));
        assert.equal(res.data.listing_status, "approved");
        const audit = await lastAudit("listing.auto_approve");
        assert.equal(audit.audit_target_id, res.data.listing_id);
        assert.equal(audit.audit_actor_user_id, await userIdOf("owner"));
    });

    it("editing an approved listing keeps it approved", async () => {
        const [listing] = await query("SELECT listing_id FROM vendor_listings WHERE listing_title = 'Approval Off Mangoes'");
        const res = await call("PUT", `/listings/${listing.listing_id}`, { as: "owner", json: { listing_title: "Approval Off Mangoes", category_id: 1, listing_price: 500 } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.listing_status, "approved");
    });
});

describe("switching approval back on", () => {
    it("new businesses and listings wait for an admin again", async () => {
        assert.equal((await setting("require_business_approval", true)).status, 200);
        assert.equal((await setting("require_listing_approval", true)).status, 200);
        assert.equal((await register("Approval Back On Bakery")).data.vendor.vendor_status, "pending");
        assert.equal((await newListing("Approval Back On Mangoes")).data.listing_status, "pending");
    });
});

describe("NID is no longer collected (client decision, 20 October)", () => {
    it("a business registers without an NID reference, and none is stored", async () => {
        const res = await register("No NID Tailors");
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const [vendor] = await query("SELECT vendor_nid_reference, vendor_nid_submitted_at FROM vendors WHERE vendor_id = $1", [res.data.vendor.vendor_id]);
        assert.deepEqual(vendor, { vendor_nid_reference: null, vendor_nid_submitted_at: null });
    });

    it("an NID sent by an old form is ignored", async () => {
        const res = await call("POST", "/auth/register/vendor", {
            as: "applicant",
            json: { vendor_name: "Old Form Tailors", vendor_phone: "01722000098", vendor_nid_reference: "1234567890" },
        });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        const [vendor] = await query("SELECT vendor_nid_reference FROM vendors WHERE vendor_id = $1", [res.data.vendor.vendor_id]);
        assert.equal(vendor.vendor_nid_reference, null);
    });
});
