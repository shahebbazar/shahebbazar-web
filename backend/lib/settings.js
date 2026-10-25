// Platform settings an admin can change without a code release (KAN-293), stored in platform_settings.
//
// Every setting is declared here with its type and default. A missing row means the default, so
// an older database without the row behaves as before.

const SETTINGS = {
    require_business_approval: {
        type: "boolean",
        default: true,
        label: "Approve new businesses before they appear",
        help: "When off, a newly registered business is public straight away.",
    },
    require_listing_approval: {
        type: "boolean",
        default: true,
        label: "Approve new products and services before they appear",
        help: "When off, a new product or service is public straight away.",
    },
    // KAN-298: off to begin with (decided 26 October 2026), so a business's event is public at once.
    require_event_approval: {
        type: "boolean",
        default: false,
        label: "Approve new events before they appear",
        help: "When off, a new event is public straight away. Admins can still see every event.",
    },
    // KAN-286: what the free plan includes (decided 21 October 2026, to confirm with the client).
    free_marketing_emails_per_month: {
        type: "integer",
        group: "marketing",
        default: 1,
        min: 0,
        max: 20,
        label: "Free email campaigns a month",
        help: "For businesses without a Marketing pass. 0 switches the free email off.",
    },
};

/** The current value of one setting. */
async function getSetting(db, key) {
    const setting = SETTINGS[key];
    if (!setting) throw new Error(`Unknown setting "${key}"`);
    const result = await db.query("SELECT setting_value FROM platform_settings WHERE setting_key = $1", [key]);
    return result.rowCount ? result.rows[0].setting_value : setting.default;
}

/** Every setting with its value and who changed it last, for the admin page. */
async function listSettings(db) {
    const result = await db.query(
        `SELECT s.setting_key, s.setting_value, s.setting_updated_at, u.user_name AS updated_by
         FROM platform_settings s LEFT JOIN users u ON u.user_id = s.setting_updated_by`
    );
    const stored = Object.fromEntries(result.rows.map((row) => [row.setting_key, row]));
    return Object.entries(SETTINGS).map(([key, setting]) => ({
        key,
        type: setting.type,
        group: setting.group ?? "approval",
        ...(setting.type === "integer" ? { min: setting.min, max: setting.max } : {}),
        label: setting.label,
        help: setting.help,
        value: stored[key] ? stored[key].setting_value : setting.default,
        updated_at: stored[key]?.setting_updated_at ?? null,
        updated_by: stored[key]?.updated_by ?? null,
    }));
}

/** Checks a new value against the setting's type. Returns an error message or null. */
function invalidValue(key, value) {
    const setting = SETTINGS[key];
    if (setting.type === "boolean" && typeof value !== "boolean") return "Value must be true or false";
    if (setting.type === "integer" && (!Number.isInteger(value) || value < setting.min || value > setting.max)) {
        return `Enter a whole number from ${setting.min} to ${setting.max}`;
    }
    return null;
}

/** Changes a setting and returns { before, after }. Run inside the caller's transaction. */
async function setSetting(db, key, value, actorId) {
    const before = await getSetting(db, key);
    await db.query(
        `INSERT INTO platform_settings (setting_key, setting_value, setting_updated_at, setting_updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value, setting_updated_at = now(), setting_updated_by = EXCLUDED.setting_updated_by`,
        [key, JSON.stringify(value), actorId]
    );
    return { before, after: value };
}

module.exports = { SETTINGS, getSetting, listSettings, invalidValue, setSetting };
