// The public site's data: home page, categories, search, business pages, events, sitemap and API docs.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ORIGIN, query, call, startApi, stopApi } = require("./support/harness");

before(startApi);
after(stopApi);

const notApproved = async () =>
    (await query("SELECT vendor_id, vendor_slug FROM vendors WHERE vendor_status <> 'approved'")).map((r) => r.vendor_slug);

describe("home page", () => {
    let home;
    before(async () => {
        home = (await call("GET", "/home")).data;
    });

    it("returns its four sections", () => {
        assert.deepEqual(Object.keys(home).sort(), ["categories", "events", "featured", "popularSearches"]);
    });

    it("shows at most 6 active top-level categories, each with a business count", () => {
        assert.ok(home.categories.length > 0 && home.categories.length <= 6);
        for (const c of home.categories) assert.ok(Number(c.business_count) >= 0, c.category_slug);
    });

    it("features at most 5 businesses, all approved and featured", async () => {
        assert.ok(home.featured.length > 0 && home.featured.length <= 5);
        const hidden = await notApproved();
        for (const b of home.featured) {
            assert.equal(b.vendor_is_featured, true);
            assert.ok(!hidden.includes(b.vendor_slug), `${b.vendor_slug} is not approved`);
        }
    });

    it("lists at most 3 upcoming published events, soonest first", () => {
        assert.ok(home.events.length <= 3);
        const starts = home.events.map((e) => new Date(e.event_starts_at).getTime());
        assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
        for (const s of starts) assert.ok(s > Date.now());
    });
});

describe("categories", () => {
    it("returns the active tree with business counts", async () => {
        const res = await call("GET", "/categories");
        assert.equal(res.status, 200);
        assert.ok(res.data.some((c) => c.category_parent_id === null));
        assert.ok(res.data.some((c) => c.category_parent_id !== null));
    });

    it("hiding a main category also hides its subcategories", async () => {
        const [parent] = await query(
            `SELECT p.category_id, p.category_slug FROM categories p
             WHERE p.category_parent_id IS NULL AND EXISTS (SELECT 1 FROM categories c WHERE c.category_parent_id = p.category_id)
             ORDER BY p.category_id LIMIT 1`
        );
        await query("UPDATE categories SET category_is_active = false WHERE category_id = $1", [parent.category_id]);
        try {
            const res = await call("GET", "/categories");
            assert.ok(!res.data.some((c) => c.category_id === parent.category_id || c.category_parent_id === parent.category_id));
        } finally {
            await query("UPDATE categories SET category_is_active = true WHERE category_id = $1", [parent.category_id]);
        }
    });
});

describe("search", () => {
    const search = async (params) => (await call("GET", `/businesses?${new URLSearchParams(params)}`)).data;

    it("never returns a business that is not approved, on any page", async () => {
        const hidden = await notApproved();
        const first = await search({ limit: 50 });
        const all = [...first.results, ...first.sponsored];
        for (let offset = 50; offset < first.total; offset += 50) all.push(...(await search({ limit: 50, offset })).results);
        const ids = all.map((b) => b.vendor_id);
        assert.equal(ids.length, first.total, "every match is reachable through paging");
        assert.equal(new Set(ids).size, ids.length, "and appears only once");
        for (const b of all) assert.ok(!hidden.includes(b.vendor_slug), `${b.vendor_slug} is not approved`);
    });

    it("matches business names, Bangla names, descriptions and approved product titles", async () => {
        const slugs = (r) => [...r.results, ...r.sponsored].map((b) => b.vendor_slug);
        assert.ok(slugs(await search({ q: "Mango Traders" })).includes("rajshahi-mango-traders"));
        assert.ok(slugs(await search({ q: "আম" })).includes("rajshahi-mango-traders"), "Bangla name");
        assert.ok(slugs(await search({ q: "Khirsapat" })).includes("rajshahi-mango-traders"), "description or product");
        assert.ok(slugs(await search({ q: "Katan Silk" })).includes("shaheb-bazar-silk-house"), "approved product title");
    });

    it("featured businesses beyond the two Sponsored slots still appear in the ordinary results", async () => {
        const featured = (await query(
            "SELECT vendor_id FROM v_business_cards WHERE vendor_is_featured"
        )).map((r) => r.vendor_id);
        assert.ok(featured.length > 2, "the seed has more featured businesses than Sponsored slots");
        const page = await search({ limit: 50 });
        const shown = new Set([...page.sponsored, ...page.results].map((b) => b.vendor_id));
        for (const id of featured) assert.ok(shown.has(id), `featured business ${id} can be found`);
    });

    it("does not match a product that is still awaiting approval", async () => {
        const r = await search({ q: "Blouse Stitching" });
        assert.ok(![...r.results, ...r.sponsored].some((b) => b.vendor_slug === "shaheb-bazar-silk-house"));
    });

    it("filters by category, including businesses in its subcategories", async () => {
        const sub = await search({ category: "silk-sarees" });
        const parent = await search({ category: "silk-textiles" });
        const ids = (r) => new Set([...r.results, ...r.sponsored].map((b) => b.vendor_id));
        assert.ok(ids(sub).size > 0);
        for (const id of ids(sub)) assert.ok(ids(parent).has(id), "a subcategory business also appears under its main category");
    });

    it("filters by area", async () => {
        const [area] = await query(
            `SELECT l.location_slug, COUNT(*)::int AS n FROM vendors v JOIN locations l USING (location_id)
             WHERE v.vendor_status = 'approved' GROUP BY 1 ORDER BY n DESC LIMIT 1`
        );
        const r = await search({ area: area.location_slug, limit: 50 });
        assert.equal(r.total, area.n);
    });

    it("puts at most 2 sponsored businesses first, only on page one, never repeated in the results", async () => {
        const page1 = await search({});
        assert.ok(page1.sponsored.length <= 2);
        for (const b of page1.sponsored) assert.equal(b.vendor_is_featured, true);
        const sponsoredIds = new Set(page1.sponsored.map((b) => b.vendor_id));
        assert.ok(!page1.results.some((b) => sponsoredIds.has(b.vendor_id)));
        assert.deepEqual((await search({ offset: 5 })).sponsored, []);
    });

    it("pages without overlap and caps the page size at 50", async () => {
        const a = await search({ limit: 3, offset: 0 });
        const b = await search({ limit: 3, offset: 3 });
        assert.equal(a.results.length, 3);
        const overlap = a.results.filter((x) => b.results.some((y) => y.vendor_id === x.vendor_id));
        assert.deepEqual(overlap, []);
        assert.equal((await search({ limit: 500 })).limit, 50);
        assert.equal((await search({ offset: -5 })).offset, 0);
    });

    it("sorts by rating, by name, and falls back to relevance for an unknown sort", async () => {
        const byRating = (await search({ sort: "rating", limit: 50 })).results.map((b) => Number(b.rating));
        assert.deepEqual(byRating, [...byRating].sort((x, y) => y - x));
        const byName = (await search({ sort: "name", limit: 50 })).results.map((b) => b.vendor_name);
        assert.deepEqual(byName, [...byName].sort((x, y) => x.localeCompare(y, "en", { sensitivity: "base" })));
        assert.equal((await search({ sort: "DROP TABLE" })).sort, "relevance");
    });

    it("treats quotes and SQL in the search text as plain text", async () => {
        const res = await call("GET", `/businesses?q=${encodeURIComponent("' OR 1=1 --")}`);
        assert.equal(res.status, 200);
        assert.equal(res.data.total, 0);
    });

    it("returns area and category facets that narrow with the filter", async () => {
        const all = await search({});
        const filtered = await search({ category: "silk-textiles" });
        const sum = (r) => r.facets.categories.reduce((n, c) => n + c.count, 0);
        assert.ok(all.facets.areas.length > 0 && all.facets.categories.length > 0);
        assert.ok(sum(filtered) <= sum(all));
    });
});

describe("business page", () => {
    it("returns the full profile of an approved business", async () => {
        const res = await call("GET", "/businesses/rajshahi-mango-traders");
        assert.equal(res.status, 200);
        for (const key of ["business", "categories", "hours", "photos", "listings", "facts", "reviews", "ratingDistribution", "similar", "social"]) {
            assert.ok(key in res.data, key);
        }
        assert.equal(res.data.business.vendor_slug, "rajshahi-mango-traders");
    });

    it("is not found for pending, rejected and unknown businesses", async () => {
        for (const slug of ["shaheb-bazar-cloth-store", "quick-cash-loans-bd", "no-such-business"]) {
            assert.equal((await call("GET", `/businesses/${slug}`)).status, 404, slug);
        }
    });

    it("shows only approved products", async () => {
        const res = await call("GET", "/businesses/shaheb-bazar-silk-house");
        assert.ok(!res.data.listings.some((l) => l.slug === "custom-blouse-stitching"));
        assert.ok(res.data.listings.length > 0);
    });

    it("shows at most 5 written, published reviews, and a rating breakdown that matches the review count", async () => {
        const res = await call("GET", "/businesses/rajshahi-mango-traders");
        assert.ok(res.data.reviews.length <= 5);
        for (const r of res.data.reviews) assert.ok(r.body);
        const counted = res.data.ratingDistribution.reduce((n, r) => n + r.count, 0);
        assert.equal(counted, Number(res.data.business.review_count));
        assert.deepEqual(res.data.ratingDistribution.map((r) => r.rating), [5, 4, 3, 2, 1]);
    });

    it("hidden reviews leave the page and the rating", async () => {
        const [review] = await query(
            `SELECT r.review_id FROM reviews r JOIN vendors v USING (vendor_id)
             WHERE v.vendor_slug = 'rajshahi-mango-traders' AND r.review_status = 'published' LIMIT 1`
        );
        const before = (await call("GET", "/businesses/rajshahi-mango-traders")).data.business.review_count;
        await query("UPDATE reviews SET review_status = 'hidden' WHERE review_id = $1", [review.review_id]);
        try {
            const after = (await call("GET", "/businesses/rajshahi-mango-traders")).data;
            assert.equal(Number(after.business.review_count), Number(before) - 1);
            assert.ok(!after.reviews.some((r) => r.review_id === review.review_id));
        } finally {
            await query("UPDATE reviews SET review_status = 'published' WHERE review_id = $1", [review.review_id]);
        }
    });

    it("suggests up to 4 similar approved businesses, not itself", async () => {
        const res = await call("GET", "/businesses/shaheb-bazar-silk-house");
        assert.ok(res.data.similar.length <= 4);
        assert.ok(!res.data.similar.some((b) => b.vendor_slug === "shaheb-bazar-silk-house"));
    });

    it("lists payment methods for approved businesses only", async () => {
        const res = await call("GET", "/businesses/rajshahi-mango-traders/payment-methods");
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.data) && res.data.length > 0);
        assert.equal((await call("GET", "/businesses/shaheb-bazar-cloth-store/payment-methods")).status, 404);
    });
});

describe("events", () => {
    before(async () => {
        await query(
            `INSERT INTO events (event_title, event_slug, event_starts_at, event_status)
             VALUES ('Draft Fair', 'draft-fair', now() + INTERVAL '5 days', 'draft'),
                    ('Old Fair', 'old-fair', now() - INTERVAL '30 days', 'published')`
        );
    });

    it("splits published events into upcoming (soonest first) and past", async () => {
        const res = await call("GET", "/events");
        const slugs = (list) => list.map((e) => e.event_slug);
        assert.ok(slugs(res.data.past).includes("old-fair"));
        assert.ok(!slugs(res.data.upcoming).includes("old-fair"));
        assert.ok(![...res.data.upcoming, ...res.data.past].some((e) => e.event_slug === "draft-fair"), "drafts are hidden");
        const starts = res.data.upcoming.map((e) => new Date(e.event_starts_at).getTime());
        assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    });

    it("returns one published event by slug; drafts and unknown slugs are not found", async () => {
        assert.equal((await call("GET", "/events/padma-river-festival")).status, 200);
        assert.equal((await call("GET", "/events/draft-fair")).status, 404);
        assert.equal((await call("GET", "/events/nope")).status, 404);
    });
});

describe("sitemap, docs and health", () => {
    it("the sitemap lists every approved business and no other", async () => {
        const res = await call("GET", "/sitemap");
        const approved = (await query("SELECT vendor_slug FROM vendors WHERE vendor_status = 'approved' ORDER BY vendor_id")).map((r) => r.vendor_slug);
        assert.deepEqual(res.data.businesses.map((b) => b.slug), approved);
        assert.ok(res.data.categories.length > 0);
    });

    it("serves the OpenAPI spec and the docs page", async () => {
        const spec = await fetch(`${ORIGIN}/api/openapi.yaml`);
        assert.equal(spec.status, 200);
        assert.match(await spec.text(), /^openapi: /m);
        const page = await fetch(`${ORIGIN}/api/docs`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /swagger/i);
    });

    it("health reports the database and schema are fine", async () => {
        const res = await call("GET", "/health");
        assert.equal(res.status, 200);
        assert.equal(res.data.ok, true);
        assert.equal(res.data.schema.ok, true);
    });
});
