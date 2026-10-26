// Marketing passes: the one place that decides what a business may do with its pass.
//
// Every function takes `db` (the pool, or a client inside a transaction) so callers control
// transactions. A pass's stored status can say "active" after its end date has passed; the
// effective status below treats that as "expired", so nothing depends on a scheduled job.
//
// Email campaigns have two free allowances: a business with no running pass (none, waiting or
// cancelled) gets the free plan's monthly email (the admin setting free_marketing_emails_per_month),
// and one whose pass ended gets EXPIRED_EMAILS_PER_WEEK. Usage is recorded against the business,
// and against the pass when there is one.

const { getSetting } = require("../../lib/settings");

const ACTIONS = {
    email_campaign: { limit: "package_email_campaign_limit", label: "email campaign" },
    ai_action: { limit: "package_ai_action_limit", label: "AI draft" },
    sms: { limit: "package_sms_limit", label: "SMS" },
};

// After a pass ends, a business keeps a small free email allowance (client decision 14, provisional).
const EXPIRED_EMAILS_PER_WEEK = Number(process.env.MARKETING_EXPIRED_EMAILS_PER_WEEK ?? 1);

const PASS_SQL = `
    SELECT s.subscription_id, s.vendor_id, s.package_id, s.subscription_status,
           s.subscription_starts_at, s.subscription_ends_at, s.subscription_price_bdt,
           s.subscription_activation_source, s.subscription_activated_by, s.subscription_status_reason,
           p.package_name, p.package_duration_days, p.package_email_campaign_limit,
           p.package_ai_action_limit, p.package_sms_limit,
           CASE WHEN s.subscription_status = 'active' AND s.subscription_ends_at <= now()
                THEN 'expired' ELSE s.subscription_status END AS effective_status
    FROM vendor_marketing_subscriptions s
    JOIN marketing_packages p ON p.package_id = s.package_id`;

/** The business's current pass: one that is waiting or running, otherwise the most recent. */
async function currentPass(db, vendorId, { lock = false } = {}) {
    const result = await db.query(
        `${PASS_SQL}
         WHERE s.vendor_id = $1
         ORDER BY (s.subscription_status IN ('pending', 'active')) DESC, s.subscription_created_at DESC, s.subscription_id DESC
         LIMIT 1 ${lock ? "FOR UPDATE OF s" : ""}`,
        [vendorId]
    );
    return result.rows[0] ?? null;
}

/** Paid allowance used so far on a pass, by action. */
async function usedAllowance(db, subscriptionId) {
    const result = await db.query(
        `SELECT usage_type, SUM(usage_quantity)::int AS used
         FROM marketing_usage_events
         WHERE subscription_id = $1 AND NOT usage_is_free
         GROUP BY usage_type`,
        [subscriptionId]
    );
    const used = Object.fromEntries(Object.keys(ACTIONS).map((a) => [a, 0]));
    for (const row of result.rows) used[row.usage_type] = row.used;
    return used;
}

/** Free emails sent by a business in the last seven days (the post-expiry allowance). */
async function freeEmailsThisWeek(db, vendorId) {
    const result = await db.query(
        `SELECT COALESCE(SUM(usage_quantity), 0)::int AS n
         FROM marketing_usage_events
         WHERE vendor_id = $1 AND usage_is_free AND usage_type = 'email_campaign'
           AND usage_created_at > now() - INTERVAL '7 days'`,
        [vendorId]
    );
    return result.rows[0].n;
}

/** Free emails sent by a business this calendar month in Bangladesh (the free plan's allowance). */
async function freeEmailsThisMonth(db, vendorId) {
    const result = await db.query(
        `SELECT COALESCE(SUM(usage_quantity), 0)::int AS n
         FROM marketing_usage_events
         WHERE vendor_id = $1 AND usage_is_free AND usage_type = 'email_campaign'
           AND usage_created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka'`,
        [vendorId]
    );
    return result.rows[0].n;
}

const monthName = () => new Date().toLocaleDateString("en-GB", { month: "long", timeZone: "Asia/Dhaka" });

/** The free plan's email allowance this month: { limit, used, left }. */
async function freePlanEmails(db, vendorId) {
    const limit = Number(await getSetting(db, "free_marketing_emails_per_month"));
    const used = await freeEmailsThisMonth(db, vendorId);
    return { limit, used, left: Math.max(0, limit - used) };
}

/** What the business's pass looks like right now, for the dashboard and the admin page. Null if it never had one. */
async function passSummary(db, vendorId) {
    const pass = await currentPass(db, vendorId);
    if (!pass) return null;
    const used = await usedAllowance(db, pass.subscription_id);
    const msLeft = pass.subscription_ends_at ? new Date(pass.subscription_ends_at) - Date.now() : 0;
    return {
        subscription_id: pass.subscription_id,
        status: pass.effective_status,
        package: { package_id: pass.package_id, name: pass.package_name, duration_days: pass.package_duration_days },
        starts_at: pass.subscription_starts_at,
        ends_at: pass.subscription_ends_at,
        days_left: pass.effective_status === "active" ? Math.max(0, Math.ceil(msLeft / 86400000)) : 0,
        price_bdt: pass.subscription_price_bdt,
        reason: pass.subscription_status_reason,
        allowances: Object.fromEntries(Object.entries(ACTIONS).map(([action, { limit }]) => [
            action,
            { limit: pass[limit], used: used[action], left: Math.max(0, pass[limit] - used[action]) },
        ])),
    };
}

const day = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });

/**
 * Can this business use `quantity` of `action` now? Returns
 * { allowed: true, subscriptionId, free, left } or { allowed: false, status, reason } with a reason
 * written for the business owner. Pass { lock: true } inside a transaction before recording usage.
 */
async function checkEntitlement(db, vendorId, action, quantity = 1, { lock = false } = {}) {
    if (!ACTIONS[action]) throw new Error(`Unknown marketing action: ${action}`);
    const pass = await currentPass(db, vendorId, { lock });
    const deny = (status, reason) => ({ allowed: false, status, reason });
    const status = pass ? pass.effective_status : "none";

    // No running pass: email campaigns use the free plan's monthly allowance; nothing else is free.
    if (["none", "pending", "cancelled"].includes(status)) {
        if (action !== "email_campaign") {
            if (status === "pending") return deny("pending", "The Marketing pass is waiting to be activated.");
            if (status === "cancelled") return deny("cancelled", "The Marketing pass was cancelled.");
            return deny("none", "This business has no Marketing pass. An administrator can activate one.");
        }
        // Lock the business row so two sends cannot both take the last free email.
        if (lock) await db.query("SELECT 1 FROM vendors WHERE vendor_id = $1 FOR UPDATE", [vendorId]);
        const free = await freePlanEmails(db, vendorId);
        if (free.left < quantity) {
            return deny(status, free.limit === 0
                ? "Free email campaigns are switched off. A Marketing pass includes email campaigns."
                : `The free plan's ${free.limit === 1 ? "email" : `${free.limit} emails`} for ${monthName()} ${free.limit === 1 ? "is" : "are"} used. A Marketing pass includes more.`);
        }
        return { allowed: true, status: "free", subscriptionId: null, free: true, left: free.left - quantity };
    }

    switch (status) {
        case "suspended":
            return deny("suspended", "The Marketing pass is suspended. Contact Shahebbazar for help.");
        case "expired": {
            const ended = `Your Marketing pass ended on ${day(pass.subscription_ends_at)}. Renew it to continue.`;
            if (action !== "email_campaign") return deny("expired", ended);
            const left = EXPIRED_EMAILS_PER_WEEK - (await freeEmailsThisWeek(db, vendorId));
            if (left < quantity) {
                return deny("expired", `${ended} The free allowance of ${EXPIRED_EMAILS_PER_WEEK} email a week is used up.`);
            }
            return { allowed: true, status: "expired", subscriptionId: pass.subscription_id, free: true, left: left - quantity };
        }
        default: {
            const limit = pass[ACTIONS[action].limit];
            const left = limit - (await usedAllowance(db, pass.subscription_id))[action];
            if (left < quantity) {
                return deny("active", `This pass's ${ACTIONS[action].label} allowance is used up (${limit} included).`);
            }
            return { allowed: true, status: "active", subscriptionId: pass.subscription_id, free: false, left: left - quantity };
        }
    }
}

/**
 * Checks and records usage in one step. Call inside a transaction (`db` is a client after BEGIN):
 * the pass row is locked so two requests cannot both spend the last allowance.
 */
async function useEntitlement(db, vendorId, action, { quantity = 1, reference = null } = {}) {
    const check = await checkEntitlement(db, vendorId, action, quantity, { lock: true });
    if (!check.allowed) return check;
    await db.query(
        `INSERT INTO marketing_usage_events (vendor_id, subscription_id, usage_type, usage_quantity, usage_is_free, usage_reference)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [vendorId, check.subscriptionId, action, quantity, check.free, reference]
    );
    return check;
}

/**
 * Keeps the business's sponsored placement in step with its passes: featured until the latest
 * end date of a running pass, and not featured when there is none.
 */
async function syncSponsoredPlacement(db, vendorId) {
    await db.query(
        `UPDATE vendors v
         SET vendor_is_featured = x.until IS NOT NULL, vendor_featured_until = x.until
         FROM (SELECT MAX(subscription_ends_at) AS until
               FROM vendor_marketing_subscriptions
               WHERE vendor_id = $1 AND subscription_status = 'active' AND subscription_ends_at > now()) x
         WHERE v.vendor_id = $1`,
        [vendorId]
    );
}

module.exports = {
    EXPIRED_EMAILS_PER_WEEK,
    ACTIONS,
    PASS_SQL,
    currentPass,
    passSummary,
    freePlanEmails,
    freeEmailsThisWeek,
    checkEntitlement,
    useEntitlement,
    syncSponsoredPlacement,
};
