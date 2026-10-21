// Sends a campaign by email (KAN-286, Stage 4). There is no separate approval step: the owner
// previews the email and confirms the send, and the latest saved version is what goes out. It is
// recorded as the approved version (campaign_approved_version_id, _at, _by), so there is a record of
// exactly what was sent and who approved it.
//
//   1. In one transaction: lock the campaign, check it hasn't been sent and its latest version has no
//      [[placeholders]] left, build the audience (only customers with active email consent,
//      audienceFor), use the allowance (the pass, the free plan's monthly email, or the ended pass's
//      weekly email), record the version as approved and mark it "sending", so a second send is refused.
//   2. Send one email per customer, each with their own unsubscribe link.
//   3. If the provider accepted none, give the allowance back and put the campaign back as it was:
//      nothing was sent. Otherwise record every email in marketing_sends and mark the
//      campaign sent (audited as campaign.send).
//
// If the API stops during step 2 the campaign stays "sending"; an admin can check marketing_sends.

const { emailAdapter } = require("../../integrations/email");
const { audienceFor } = require("./consent");
const { useEntitlement } = require("./entitlements");
const { buildCampaignEmail } = require("./emailMessage");
const { placeholdersIn } = require("./templates");

const usageReference = (campaignId) => `campaign:${campaignId}`;

/** Why a campaign can't be sent from its status, or null if it can. */
function statusProblem(status) {
    if (status === "sending") return "This campaign is being sent.";
    if (status === "sent") return "This campaign has already been sent. Start a new campaign to send again.";
    if (status !== "draft" && status !== "approved") return "This campaign can't be sent.";
    return null;
}

/**
 * Returns { status, body } for the route: 200 with { sent, failed } when the provider accepted at
 * least one email, otherwise an error the owner can act on.
 */
async function sendCampaign(pool, { vendorId, campaignId, userId }) {
    const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
    const client = await pool.connect();
    let campaign;
    let audience;
    let version;
    try {
        await client.query("BEGIN");
        campaign = (await client.query(
            "SELECT * FROM marketing_campaigns WHERE campaign_id = $1 AND vendor_id = $2 FOR UPDATE", [campaignId, vendorId]
        )).rows[0];
        if (!campaign) {
            await client.query("ROLLBACK");
            return fail(404, "Campaign not found");
        }
        const problem = statusProblem(campaign.campaign_status);
        if (problem) {
            await client.query("ROLLBACK");
            return fail(409, problem);
        }
        version = (await client.query(
            "SELECT version_id, version_number, version_content FROM marketing_campaign_versions WHERE campaign_id = $1 ORDER BY version_number DESC LIMIT 1",
            [campaignId]
        )).rows[0];
        const left = placeholdersIn(version.version_content);
        if (left.length) {
            await client.query("ROLLBACK");
            return fail(409, "Fill in the parts marked [[like this]] before sending.", { code: "placeholders", placeholders: left });
        }
        audience = await audienceFor(client, vendorId, "email");
        if (audience.length === 0) {
            await client.query("ROLLBACK");
            return fail(409, "No customers have chosen to get your offers by email yet, so there's no one to send to.", { code: "no_audience" });
        }
        const use = await useEntitlement(client, vendorId, "email_campaign", { reference: usageReference(campaignId) });
        if (!use.allowed) {
            await client.query("ROLLBACK");
            return fail(409, use.reason, { code: "allowance" });
        }
        // Confirming the send approves this version.
        await client.query(
            `UPDATE marketing_campaigns SET campaign_status = 'sending', campaign_approved_version_id = $2, campaign_approved_at = now(),
                 campaign_approved_by = $3, campaign_updated_at = now()
             WHERE campaign_id = $1`,
            [campaignId, version.version_id, userId]
        );
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    } finally {
        client.release();
    }

    // Outside the transaction: the provider can be slow, and the campaign is already marked "sending".
    const content = version.version_content;
    const replyTo = (await pool.query("SELECT vendor_email FROM vendors WHERE vendor_id = $1", [vendorId])).rows[0]?.vendor_email;
    const adapter = emailAdapter();
    const results = [];
    for (const recipient of audience) {
        try {
            const { messageId } = await adapter.send(buildCampaignEmail({ campaign, content, recipient, replyTo }));
            results.push({ recipient, status: "sent", messageId });
        } catch (err) {
            results.push({ recipient, status: "failed", error: String(err?.message || err).slice(0, 500) });
        }
    }
    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.length - sent;

    const done = await pool.connect();
    try {
        await done.query("BEGIN");
        if (sent === 0) {
            // Nothing went out: the allowance is given back and the campaign is as it was, ready to try again.
            await done.query("DELETE FROM marketing_usage_events WHERE vendor_id = $1 AND usage_reference = $2", [vendorId, usageReference(campaignId)]);
            await done.query(
                `UPDATE marketing_campaigns SET campaign_status = $2, campaign_approved_version_id = $3, campaign_approved_at = $4,
                     campaign_approved_by = $5, campaign_updated_at = now()
                 WHERE campaign_id = $1`,
                [campaignId, campaign.campaign_status, campaign.campaign_approved_version_id, campaign.campaign_approved_at, campaign.campaign_approved_by]
            );
            await done.query("COMMIT");
            console.error(`Campaign ${campaignId}: the email provider (${adapter.name}) accepted none of ${failed} emails:`, results[0].error);
            return fail(502, "The email service didn't accept the emails, so nothing was sent and no allowance was used. Try again later.");
        }
        for (const r of results) {
            await done.query(
                `INSERT INTO marketing_sends (campaign_id, vendor_id, user_id, send_address, send_status, send_provider, send_provider_message_id, send_error)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [campaignId, vendorId, r.recipient.user_id, r.recipient.address, r.status, adapter.name, r.messageId ?? null, r.error ?? null]
            );
        }
        await done.query(
            `UPDATE marketing_campaigns SET campaign_status = 'sent', campaign_sent_at = now(), campaign_sent_by = $2, campaign_updated_at = now()
             WHERE campaign_id = $1`,
            [campaignId, userId]
        );
        await done.query(
            `INSERT INTO audit_logs (audit_actor_user_id, audit_action, audit_target_type, audit_target_id, audit_before, audit_after)
             VALUES ($1, 'campaign.send', 'campaign', $2, $3, $4)`,
            [userId, campaignId, JSON.stringify({ status: campaign.campaign_status }),
                JSON.stringify({ status: "sent", version: version.version_number, provider: adapter.name, sent, failed })]
        );
        await done.query("COMMIT");
        return { status: 200, body: { sent, failed } };
    } catch (err) {
        await done.query("ROLLBACK").catch(() => { });
        throw err;
    } finally {
        done.release();
    }
}

/** A sent campaign's results, or null before it is sent. */
async function sendResults(db, campaignId) {
    const row = (await db.query(
        `SELECT COUNT(*) FILTER (WHERE send_status = 'sent')::int AS sent,
                COUNT(*) FILTER (WHERE send_status = 'failed')::int AS failed
         FROM marketing_sends WHERE campaign_id = $1`,
        [campaignId]
    )).rows[0];
    return row.sent + row.failed === 0 ? null : row;
}

module.exports = { sendCampaign, sendResults, statusProblem };
