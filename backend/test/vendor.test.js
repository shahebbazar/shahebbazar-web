// What a business owner can do: the business profile form, payment methods, business photos and the dashboard.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { UPLOAD_DIR, PNG, query, call, startApi, stopApi } = require("./support/harness");

const MANGO = 1; // business 1 belongs to the "owner" account

before(startApi);
after(stopApi);

/** The profile form as loaded, turned into what the form sends back. */
async function currentForm(as = "owner", vendorId = MANGO) {
    const res = await call("GET", `/vendors/${vendorId}/profile`, { as });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const p = res.data;
    return {
        name: p.vendor.vendor_name,
        name_bn: p.vendor.vendor_name_bn ?? "",
        category_ids: p.category_ids,
        location_id: p.vendor.location_id,
        address: p.vendor.vendor_address,
        phone: p.vendor.vendor_phone,
        whatsapp: p.vendor.vendor_whatsapp ?? "",
        description: p.vendor.vendor_description,
        email: p.vendor.vendor_email ?? "",
        website: p.vendor.vendor_website ?? "",
        facts: p.facts,
        social: p.social,
        hours: p.hours,
        photo_order: p.photos.map((ph) => ph.id),
    };
}
const save = (body, as = "owner", vendorId = MANGO) => call("PUT", `/vendors/${vendorId}/profile`, { as, json: body });

describe("business profile form", () => {
    it("loads with its options and limits", async () => {
        const res = await call("GET", `/vendors/${MANGO}/profile`, { as: "owner" });
        assert.ok(res.data.options.categories.length > 0 && res.data.options.areas.length > 0);
        assert.equal(res.data.limits.descriptionMin, 20);
    });

    it("saving the form unchanged succeeds", async () => {
        const res = await save(await currentForm());
        assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    it("tidies what the owner typed before storing it", async () => {
        const form = await currentForm();
        const res = await save({
            ...form,
            phone: "01712-345678",
            email: "Sales@Mango.Example",
            website: "https://www.mango.example/shop",
            social: { facebook: "facebook.com/rajshahimango" },
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const [v] = await query("SELECT vendor_phone, vendor_email, vendor_website FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.deepEqual(v, { vendor_phone: "+8801712345678", vendor_email: "sales@mango.example", vendor_website: "www.mango.example/shop" });
        const [s] = await query("SELECT social_url FROM vendor_social_links WHERE vendor_id = $1 AND social_platform = 'facebook'", [MANGO]);
        assert.equal(s.social_url, "https://facebook.com/rajshahimango");
    });

    it("reports every invalid field at once and saves nothing", async () => {
        const form = await currentForm();
        const res = await save({
            ...form,
            name: "",
            category_ids: [1, 2, 3, 4],
            address: "abc",
            phone: "12345",
            description: "Too short",
            website: "not a site",
            social: { instagram: "https://facebook.com/someone" },
            hours: [{ day: 1, mode: "open", open: "18:00", close: "09:00" }],
            facts: [{ label: "Parking", value: "Yes", group: "about" }, { label: "parking", value: "No", group: "about" }],
        });
        assert.equal(res.status, 400);
        for (const key of ["name", "category_ids", "address", "phone", "description", "website", "social.instagram", "hours.1", "facts.1.label"]) {
            assert.ok(key in res.data.errors, `error for ${key}`);
        }
        const [v] = await query("SELECT vendor_name FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.equal(v.vendor_name, form.name, "nothing was saved");
    });

    it("refuses a hidden category and an area that is not on the list", async () => {
        const form = await currentForm();
        const [hidden] = await query("INSERT INTO categories (category_name, category_slug, category_is_active) VALUES ('Hidden Test', 'hidden-test', false) RETURNING category_id");
        const res = await save({ ...form, category_ids: [hidden.category_id], location_id: 999999 });
        assert.equal(res.status, 400);
        assert.ok(res.data.errors.category_ids && res.data.errors.location_id);
    });

    it("an admin can correct another business's profile; a suspended business cannot be edited", async () => {
        const form = await currentForm("admin", 6);
        assert.equal((await save({ ...form, description: `${form.description} Corrected by an administrator.`.slice(0, 500) }, "admin", 6)).status, 200);
        await query("UPDATE vendors SET vendor_status = 'suspended' WHERE vendor_id = 6");
        try {
            assert.equal((await save(form, "admin", 6)).status, 409);
        } finally {
            await query("UPDATE vendors SET vendor_status = 'approved' WHERE vendor_id = 6");
        }
    });
});

describe("payment methods", () => {
    const put = (methods, as = "owner") => call("PUT", `/vendors/${MANGO}/payment-methods`, { as, json: { methods } });

    it("refuses unknown methods, duplicates, long notes and notes with account numbers", async () => {
        assert.equal((await put([{ payment_method: "paypal" }])).status, 400);
        assert.equal((await put([{ payment_method: "cash" }, { payment_method: "cash" }])).status, 400);
        assert.equal((await put([{ payment_method: "cash", payment_note: "x".repeat(121) }])).status, 400);
        const res = await put([{ payment_method: "bkash", payment_note: "Send to 01712-345678" }]);
        assert.equal(res.status, 400);
        assert.match(res.data.error, /phone or account number/);
        assert.equal((await call("PUT", `/vendors/${MANGO}/payment-methods`, { as: "owner", json: { methods: "cash" } })).status, 400);
    });

    it("saves the set in the order given, and the public page shows it", async () => {
        const methods = [{ payment_method: "nagad", payment_note: "Orders above 500 taka" }, { payment_method: "cash", payment_note: null }];
        assert.equal((await put(methods)).status, 200);
        const pub = await call("GET", "/businesses/rajshahi-mango-traders/payment-methods");
        assert.deepEqual(pub.data.map((m) => m.payment_method), ["nagad", "cash"]);
        assert.equal(pub.data[0].payment_note, "Orders above 500 taka");
    });

    it("an empty list removes them all", async () => {
        assert.equal((await put([])).status, 200);
        assert.deepEqual((await call("GET", "/businesses/rajshahi-mango-traders/payment-methods")).data, []);
    });
});

describe("business photos", () => {
    let photo;

    it("uploading a photo adds it and makes the first photo the cover", async () => {
        await query("DELETE FROM vendor_photos WHERE vendor_id = $1", [MANGO]);
        const form = new FormData();
        form.append("photos", new Blob([PNG], { type: "image/png" }), "shop.png");
        const res = await call("POST", `/vendors/${MANGO}/photos`, { as: "owner", form });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        photo = res.data.photos[0];
        assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(photo.url))));
        const [v] = await query("SELECT vendor_cover_url FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.equal(v.vendor_cover_url, photo.url);
    });

    it("another business's owner cannot remove it", async () => {
        assert.equal((await call("DELETE", `/vendors/6/photos/${photo.id}`, { as: "otherVendor" })).status, 404);
    });

    it("removing it deletes the file and clears the cover", async () => {
        const res = await call("DELETE", `/vendors/${MANGO}/photos/${photo.id}`, { as: "owner" });
        assert.equal(res.status, 204, JSON.stringify(res.data));
        assert.equal(fs.existsSync(path.join(UPLOAD_DIR, path.basename(photo.url))), false);
        const [v] = await query("SELECT vendor_cover_url FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.equal(v.vendor_cover_url, null);
        assert.equal((await call("DELETE", `/vendors/${MANGO}/photos/${photo.id}`, { as: "owner" })).status, 404);
    });
});

describe("business logo", () => {
    const upload = async () => {
        const form = new FormData();
        form.append("logo", new Blob([PNG], { type: "image/png" }), "logo.png");
        const res = await call("POST", `/vendors/${MANGO}/logo`, { as: "owner", form });
        assert.equal(res.status, 201, JSON.stringify(res.data));
        return res.data.logo_url;
    };
    const onDisk = (url) => fs.existsSync(path.join(UPLOAD_DIR, path.basename(url)));

    it("replacing the logo deletes the old file", async () => {
        const first = await upload();
        const second = await upload();
        assert.equal(onDisk(first), false);
        assert.equal(onDisk(second), true);
    });

    it("removing the logo deletes its file", async () => {
        const logo = await upload();
        assert.equal((await call("DELETE", `/vendors/${MANGO}/logo`, { as: "owner" })).status, 204);
        assert.equal(onDisk(logo), false);
        const [v] = await query("SELECT vendor_logo_url FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.equal(v.vendor_logo_url, null);
    });

    it("a file still used elsewhere is kept", async () => {
        const logo = await upload();
        const [listing] = await query("SELECT listing_id FROM vendor_listings WHERE vendor_id = $1 LIMIT 1", [MANGO]);
        await query("INSERT INTO listing_photos (listing_id, photo_url) VALUES ($1, $2)", [listing.listing_id, logo]);
        assert.equal((await call("DELETE", `/vendors/${MANGO}/logo`, { as: "owner" })).status, 204);
        assert.equal(onDisk(logo), true, "a listing photo still uses this file");
    });
});

describe("dashboard", () => {
    it("returns the business and its figures for 7, 30 or 90 days", async () => {
        for (const days of [7, 30, 90]) {
            const res = await call("GET", `/vendors/${MANGO}/dashboard?days=${days}`, { as: "owner" });
            assert.equal(res.status, 200, JSON.stringify(res.data));
            assert.equal(res.data.vendor.vendor_id, MANGO);
        }
    });

    it("the summary gives the name, slug and status for the page frame", async () => {
        const res = await call("GET", `/vendors/${MANGO}/summary`, { as: "owner" });
        assert.equal(res.data.vendor_slug, "rajshahi-mango-traders");
        assert.ok(res.data.vendor_status);
    });
});
