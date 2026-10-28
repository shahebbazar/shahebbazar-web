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
        alt_phone: p.vendor.vendor_phone_alt ?? "",
        alt_phone_type: p.vendor.vendor_phone_alt_type ?? "landline",
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
        // The contact number is the owner's sign-in mobile: a different one sent by the form is ignored.
        assert.deepEqual(v, { vendor_phone: "+8801711000005", vendor_email: "sales@mango.example", vendor_website: "www.mango.example/shop" });
        const [s] = await query("SELECT social_url FROM vendor_social_links WHERE vendor_id = $1 AND social_platform = 'facebook'", [MANGO]);
        assert.equal(s.social_url, "https://facebook.com/rajshahimango");
    });

    it("a second number is saved with its type apart from the contact number, shown on the business page, and can be removed", async () => {
        const form = await currentForm();
        const res = await save({ ...form, alt_phone: "0721 775544", alt_phone_type: "landline" });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const [v] = await query("SELECT vendor_phone_alt, vendor_phone_alt_type FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.deepEqual(v, { vendor_phone_alt: "+880721775544", vendor_phone_alt_type: "landline" });
        const [slug] = await query("SELECT vendor_slug FROM vendors WHERE vendor_id = $1", [MANGO]);
        const { business } = (await call("GET", `/businesses/${slug.vendor_slug}`)).data;
        assert.deepEqual([business.vendor_phone_alt, business.vendor_phone_alt_type], ["+880721775544", "landline"]);
        assert.equal((await save({ ...form, alt_phone: "01811-223344", alt_phone_type: "mobile" })).status, 200);
        assert.equal((await query("SELECT vendor_phone_alt_type FROM vendors WHERE vendor_id = $1", [MANGO]))[0].vendor_phone_alt_type, "mobile");
        // The owner's sign-in number is untouched.
        const [owner] = await query("SELECT u.user_phone FROM users u JOIN vendors v ON v.user_id = u.user_id WHERE v.vendor_id = $1", [MANGO]);
        assert.equal(owner.user_phone, "+8801711000005");
        assert.equal((await save({ ...form, alt_phone: "" })).status, 200);
        const [cleared] = await query("SELECT vendor_phone_alt, vendor_phone_alt_type FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.deepEqual(cleared, { vendor_phone_alt: null, vendor_phone_alt_type: null });
    });

    it("reports every invalid field at once and saves nothing", async () => {
        const form = await currentForm();
        const res = await save({
            ...form,
            name: "",
            category_ids: [1, 2, 3, 4],
            address: "abc",
            alt_phone: "12345",
            description: "Too short",
            website: "not a site",
            social: { instagram: "https://facebook.com/someone" },
            hours: [{ day: 1, mode: "open", open: "18:00", close: "09:00" }],
            facts: [{ label: "Parking", value: "Yes", group: "about" }, { label: "parking", value: "No", group: "about" }],
        });
        assert.equal(res.status, 400);
        for (const key of ["name", "category_ids", "address", "alt_phone", "description", "website", "social.instagram", "hours.1", "facts.1.label"]) {
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

    const exists = (stored) => fs.existsSync(path.join(UPLOAD_DIR, path.basename(stored)));
    const cropped = (crop) => {
        const form = new FormData();
        form.append("photo", new Blob([PNG], { type: "image/png" }), "cropped.png");
        if (crop !== undefined) form.append("crop", crop);
        return form;
    };

    it("replacing its file (a cropped cover) keeps its place, updates the cover, and keeps the file it replaced as the original", async () => {
        assert.equal((await call("PUT", `/vendors/${MANGO}/photos/${photo.id}/file`, { as: "otherVendor", form: cropped() })).status, 403);
        const crop = { zoom: 1.5, centre: { x: 40, y: 20 } };
        const res = await call("PUT", `/vendors/${MANGO}/photos/${photo.id}/file`, { as: "owner", form: cropped(JSON.stringify(crop)) });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const [replaced] = res.data.photos;
        assert.equal(replaced.id, photo.id);
        assert.notEqual(replaced.url, photo.url);
        // Uploaded before originals were kept, so the photo it was cropped from is the file it replaced.
        assert.equal(replaced.original_url, photo.url);
        assert.deepEqual(replaced.crop, crop);
        assert.ok(exists(photo.url));
        const [v] = await query("SELECT vendor_cover_url FROM vendors WHERE vendor_id = $1", [MANGO]);
        assert.equal(v.vendor_cover_url, replaced.url);
        photo = replaced;
    });

    it("the photo a cover was cropped from can be kept with it, replacing an earlier one (KAN-330)", async () => {
        const form = new FormData();
        form.append("original", new Blob([PNG], { type: "image/png" }), "whole.png");
        form.append("crop", JSON.stringify({ zoom: 2, centre: { x: 10, y: 5 } }));
        assert.equal((await call("PUT", `/vendors/${MANGO}/photos/${photo.id}/original`, { as: "otherVendor", form })).status, 403);
        const res = await call("PUT", `/vendors/${MANGO}/photos/${photo.id}/original`, { as: "owner", form });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const [kept] = res.data.photos;
        assert.equal(kept.url, photo.url, "the cover itself is unchanged");
        assert.notEqual(kept.original_url, photo.original_url);
        assert.deepEqual(kept.crop, { zoom: 2, centre: { x: 10, y: 5 } });
        assert.ok(exists(kept.original_url));
        assert.equal(exists(photo.original_url), false, "the earlier original is deleted");
        assert.equal((await call("PUT", `/vendors/${MANGO}/photos/999999/original`, { as: "owner", form })).status, 404);
        photo = kept;
    });

    it("cropping it again keeps the original and deletes only the old crop; a bad crop is ignored", async () => {
        const res = await call("PUT", `/vendors/${MANGO}/photos/${photo.id}/file`, { as: "owner", form: cropped("not json") });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const [again] = res.data.photos;
        assert.equal(again.original_url, photo.original_url);
        assert.equal(again.crop, null);
        assert.equal(exists(photo.url), false);
        assert.ok(exists(again.original_url));
        photo = again;
    });

    it("removing it deletes the file and its original, and clears the cover", async () => {
        const res = await call("DELETE", `/vendors/${MANGO}/photos/${photo.id}`, { as: "owner" });
        assert.equal(res.status, 204, JSON.stringify(res.data));
        assert.equal(exists(photo.url), false);
        assert.equal(exists(photo.original_url), false);
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
