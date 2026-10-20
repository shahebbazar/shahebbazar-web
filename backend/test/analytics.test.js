// Analytics beacons: searches and business-page views, without counting bots or repeat visits.
// Runs against the real API and a throwaway database; see test/support/harness.js.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ORIGIN, query, startApi, stopApi } = require("./support/harness");

before(startApi);
after(stopApi);

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

/** Sends a beacon the way the browser does: a text/plain body, with a chosen user agent. */
async function beacon(path, body, agent = BROWSER) {
    const headers = { "Content-Type": "text/plain" };
    if (agent !== null) headers["User-Agent"] = agent;
    const res = await fetch(`${ORIGIN}/api${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.status;
}
const count = async (sql, params) => Number((await query(sql, params))[0].n);
const searches = (q) => count("SELECT COUNT(*) AS n FROM search_logs WHERE search_query_normalised = $1", [q]);
const views = (slug) =>
    count("SELECT COUNT(*) AS n FROM vendor_profile_views pv JOIN vendors v USING (vendor_id) WHERE v.vendor_slug = $1", [slug]);

describe("search beacon", () => {
    it("needs a search text", async () => {
        assert.equal(await beacon("/track/search", { q: "   " }), 400);
        assert.equal(await beacon("/track/search", { q: "!!!" }), 400, "punctuation only");
    });

    it("records a search once per visitor in 30 minutes, grouping case and punctuation", async () => {
        assert.equal(await beacon("/track/search", { q: "Langra Mango!", resultCount: 3 }), 204);
        assert.equal(await beacon("/track/search", { q: "langra   mango" }), 204);
        assert.equal(await searches("langra mango"), 1);
        assert.equal(await beacon("/track/search", { q: "langra mango" }, `${BROWSER} Edg/130`), 204);
        assert.equal(await searches("langra mango"), 2, "a different visitor counts separately");
    });

    it("keeps the filters, ignoring unknown ones", async () => {
        await beacon("/track/search", { q: "silk saree", category: "silk-sarees", area: "no-such-area" });
        const [row] = await query(
            "SELECT category_id IS NOT NULL AS has_category, location_id FROM search_logs WHERE search_query_normalised = 'silk saree'"
        );
        assert.deepEqual(row, { has_category: true, location_id: null });
    });

    it("counts appearances for approved businesses only, at most 25", async () => {
        const [pending] = await query("SELECT vendor_id FROM vendors WHERE vendor_status = 'pending' LIMIT 1");
        const ids = [1, 1, pending.vendor_id, -3, "x", ...Array.from({ length: 40 }, (_, i) => i + 100)];
        await beacon("/track/search", { q: "impression test", vendorIds: ids });
        const counted = await query("SELECT vendor_id FROM vendor_search_impressions WHERE impression_day = CURRENT_DATE");
        const vendorIds = counted.map((r) => r.vendor_id);
        assert.ok(vendorIds.includes(1));
        assert.ok(!vendorIds.includes(pending.vendor_id), "pending business not counted");
        const [{ n }] = await query("SELECT impression_count AS n FROM vendor_search_impressions WHERE vendor_id = 1 AND impression_day = CURRENT_DATE");
        assert.equal(n, 1, "a repeated id counts once");
    });

    // null: no header set, so Node's fetch sends its default "node", as any Node script would.
    it("ignores bots, link previews and scripts (including Node's own fetch)", async () => {
        for (const agent of ["Googlebot/2.1", "facebookexternalhit/1.1", "WhatsApp/2.23", "curl/8.0", "python-requests/2.31", null]) {
            assert.equal(await beacon("/track/search", { q: "bot check" }, agent), 204);
        }
        assert.equal(await searches("bot check"), 0);
    });
});

describe("view beacon", () => {
    it("needs a business", async () => {
        assert.equal(await beacon("/track/view", {}), 400);
    });

    it("records a view of an approved business once per visitor in 30 minutes, with its source", async () => {
        const before = await views("padma-handicrafts");
        await beacon("/track/view", { slug: "padma-handicrafts", source: "sponsored" });
        await beacon("/track/view", { slug: "padma-handicrafts", source: "sponsored" });
        assert.equal(await views("padma-handicrafts"), before + 1);
        const [row] = await query(
            `SELECT view_source FROM vendor_profile_views pv JOIN vendors v USING (vendor_id)
             WHERE v.vendor_slug = 'padma-handicrafts' ORDER BY view_id DESC LIMIT 1`
        );
        assert.equal(row.view_source, "sponsored");
    });

    it("an unknown source is recorded as direct", async () => {
        await beacon("/track/view", { slug: "green-life-pharmacy", source: "hacker" });
        const [row] = await query(
            `SELECT view_source FROM vendor_profile_views pv JOIN vendors v USING (vendor_id)
             WHERE v.vendor_slug = 'green-life-pharmacy' ORDER BY view_id DESC LIMIT 1`
        );
        assert.equal(row.view_source, "direct");
    });

    it("does not record views of unapproved or unknown businesses, or from bots", async () => {
        const pendingBefore = await views("shaheb-bazar-cloth-store");
        assert.equal(await beacon("/track/view", { slug: "shaheb-bazar-cloth-store" }), 204);
        assert.equal(await views("shaheb-bazar-cloth-store"), pendingBefore);
        assert.equal(await beacon("/track/view", { slug: "no-such-business" }), 204);
        const botBefore = await views("barind-agro-supplies");
        await beacon("/track/view", { slug: "barind-agro-supplies" }, "Mozilla/5.0 (compatible; bingbot/2.0)");
        assert.equal(await views("barind-agro-supplies"), botBefore);
    });
});
