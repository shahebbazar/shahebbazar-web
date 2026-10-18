const express = require("express");
const pool = require("../db");
const {
    parseId,
    cleanText,
} = require("../lib/currentUser");

const {
    requireAuthenticatedUser,
    requireRole,
    vendorOwnerOnly,
} = require("../lib/middleware/auth");
const { notifyNewMessage, listAlerts, markAlertsRead } = require("../lib/notify");

const router = express.Router();
const BODY_MAX = 2000;

// Validates a message body; returns { error } or { body }.
function parseBody(raw) {
    const body = cleanText(raw);
    if (!body) return { error: "Write a message first." };
    if (body.length > BODY_MAX) return { error: `Keep the message under ${BODY_MAX} characters.` };
    return { body };
}

// Lists conversations for one side: the customer (by user) or the business (by vendor).
async function listConversations({ userId, vendorId, inquiriesOnly }) {
    const where = vendorId ? "c.vendor_id = $1" : "c.user_id = $1";
    const viewer = vendorId ? "v.user_id" : "c.user_id";
    const result = await pool.query(
        `SELECT c.conversation_id, c.conversation_status AS status,
                c.conversation_last_message_at AS last_message_at,
                v.vendor_id, v.vendor_name, v.vendor_slug,
                u.user_name AS customer_name,
                l.listing_id, l.listing_title,
                (SELECT m.message_body FROM messages m WHERE m.conversation_id = c.conversation_id
                 ORDER BY m.message_created_at DESC, m.message_id DESC LIMIT 1) AS last_message,
                (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.conversation_id
                   AND m.sender_user_id <> ${viewer} AND m.message_read_at IS NULL) AS unread
         FROM conversations c
         JOIN vendors v ON v.vendor_id = c.vendor_id
         JOIN users u ON u.user_id = c.user_id
         LEFT JOIN vendor_listings l ON l.listing_id = c.listing_id
         WHERE ${where} ${inquiriesOnly ? "AND c.listing_id IS NOT NULL" : ""}
         ORDER BY c.conversation_last_message_at DESC NULLS LAST, c.conversation_id DESC`,
        [vendorId ?? userId]
    );
    return result.rows;
}

// Loads one conversation with its messages and marks the other side's messages as read.
async function openConversation(conversationId, viewerUserId) {
    const head = await pool.query(
        `SELECT c.conversation_id, c.conversation_status AS status, c.user_id, c.vendor_id,
                v.vendor_name, v.vendor_slug, v.user_id AS owner_user_id,
                u.user_name AS customer_name, l.listing_id, l.listing_title
         FROM conversations c
         JOIN vendors v ON v.vendor_id = c.vendor_id
         JOIN users u ON u.user_id = c.user_id
         LEFT JOIN vendor_listings l ON l.listing_id = c.listing_id
         WHERE c.conversation_id = $1`,
        [conversationId]
    );
    if (head.rowCount === 0) return null;

    await pool.query(
        `UPDATE messages SET message_read_at = NOW()
         WHERE conversation_id = $1 AND sender_user_id <> $2 AND message_read_at IS NULL`,
        [conversationId, viewerUserId]
    );
    await pool.query(
        `UPDATE notifications SET notification_read_at = NOW()
         WHERE user_id = $1 AND notification_channel = 'in_app' AND notification_read_at IS NULL
           AND notification_payload->>'conversation_id' = $2`,
        [viewerUserId, String(conversationId)]
    );

    const messages = await pool.query(
        `SELECT message_id, message_body AS body, message_created_at AS created_at,
                message_read_at AS read_at, sender_user_id = $2 AS mine
         FROM messages WHERE conversation_id = $1
         ORDER BY message_created_at, message_id`,
        [conversationId, viewerUserId]
    );
    return { conversation: head.rows[0], messages: messages.rows };
}

// Adds a message to a conversation and alerts the other side.
async function addMessage(conversation, senderUserId, body, senderName) {
    const recipient = senderUserId === conversation.user_id ? conversation.owner_user_id : conversation.user_id;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const inserted = await client.query(
            `INSERT INTO messages (conversation_id, sender_user_id, message_body)
             VALUES ($1, $2, $3) RETURNING message_id, message_created_at AS created_at`,
            [conversation.conversation_id, senderUserId, body]
        );
        await client.query(
            "UPDATE conversations SET conversation_last_message_at = NOW() WHERE conversation_id = $1",
            [conversation.conversation_id]
        );
        await notifyNewMessage(client, {
            userId: recipient,
            conversationId: conversation.conversation_id,
            messageId: inserted.rows[0].message_id,
            from: senderName,
            preview: body.slice(0, 120),
        });
        await client.query("COMMIT");
        return inserted.rows[0];
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    } finally {
        client.release();
    }
}

// Loads the conversation head used by addMessage.
async function conversationHead(conversationId) {
    const result = await pool.query(
        `SELECT c.conversation_id, c.user_id, c.vendor_id, c.conversation_status, v.user_id AS owner_user_id,
                v.vendor_name, u.user_name AS customer_name
         FROM conversations c
         JOIN vendors v ON v.vendor_id = c.vendor_id
         JOIN users u ON u.user_id = c.user_id
         WHERE c.conversation_id = $1`,
        [conversationId]
    );
    return result.rows[0] ?? null;
}

router.use(
    "/me",
    requireAuthenticatedUser,
    requireRole("customer")
);

// Customer side --------------------------------------------------------

router.post("/me/conversations", async (req, res) => {
    const vendorId = parseId(req.body?.vendor_id);
    const listingId = req.body?.listing_id == null || req.body.listing_id === "" ? null : parseId(req.body.listing_id);
    if (!vendorId) return res.status(400).json({ error: "Choose a business to message." });
    if (req.body?.listing_id && !listingId) return res.status(400).json({ error: "Invalid product." });
    const parsed = parseBody(req.body?.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    try {
        const userId = req.user.user_id;
        //if (!userId) return res.status(500).json({ error: "No customer account exists to send from." });

        const vendor = await pool.query(
            "SELECT vendor_id FROM vendors WHERE vendor_id = $1 AND vendor_status = 'approved'",
            [vendorId]
        );
        if (vendor.rowCount === 0) return res.status(404).json({ error: "Business not found" });
        if (listingId) {
            const listing = await pool.query(
                `SELECT 1 FROM vendor_listings
                 WHERE listing_id = $1 AND vendor_id = $2 AND listing_status = 'approved'`,
                [listingId, vendorId]
            );
            if (listing.rowCount === 0) return res.status(404).json({ error: "Product not found" });
        }

        let found = await pool.query(
            `SELECT conversation_id FROM conversations
             WHERE vendor_id = $1 AND user_id = $2 AND listing_id IS NOT DISTINCT FROM $3`,
            [vendorId, userId, listingId]
        );
        if (found.rowCount === 0) {
            found = await pool.query(
                `INSERT INTO conversations (vendor_id, user_id, listing_id)
                 VALUES ($1, $2, $3) RETURNING conversation_id`,
                [vendorId, userId, listingId]
            );
        }
        const conversation = await conversationHead(found.rows[0].conversation_id);
        if (conversation.conversation_status !== "open") {
            return res.status(409).json({ error: "This conversation has been closed." });
        }
        await addMessage(conversation, userId, parsed.body, conversation.customer_name);
        res.status(201).json({ conversation_id: conversation.conversation_id });
    } catch (err) {
        console.error("POST /api/me/conversations failed:", err);
        res.status(500).json({ error: "Could not send the message. Try again." });
    }
});

router.get("/me/conversations", async (req, res) => {
    try {
        const userId = req.user.user_id;
        res.json(
            await listConversations({ userId })
        );
    } catch (err) {
        console.error("GET /api/me/conversations failed:", err);
        res.status(500).json({ error: "Could not load your messages" });
    }
});

router.get("/me/conversations/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
        const userId = req.user.user_id;
        const thread = await openConversation(id, userId);
        if (!thread || thread.conversation.user_id !== userId) return res.status(404).json({ error: "Conversation not found" });
        res.json(thread);
    } catch (err) {
        console.error(`GET /api/me/conversations/${id} failed:`, err);
        res.status(500).json({ error: "Could not load the conversation" });
    }
});

router.post("/me/conversations/:id/messages", async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const parsed = parseBody(req.body?.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
        const userId = req.user.user_id;
        const conversation = await conversationHead(id);
        if (!conversation || conversation.user_id !== userId) return res.status(404).json({ error: "Conversation not found" });
        if (conversation.conversation_status !== "open") return res.status(409).json({ error: "This conversation has been closed." });
        res.status(201).json(await addMessage(conversation, userId, parsed.body, conversation.customer_name));
    } catch (err) {
        console.error(`POST /api/me/conversations/${id}/messages failed:`, err);
        res.status(500).json({ error: "Could not send the message. Try again." });
    }
});

router.get("/me/alerts", async (req, res) => {
    try {
        const userId = req.user.user_id;
        res.json(
            await listAlerts(userId)
        );
    } catch (err) {
        console.error("GET /api/me/alerts failed:", err);
        res.status(500).json({ error: "Could not load alerts" });
    }
});

router.post("/me/alerts/read", async (req, res) => {
    try {
        const userId = req.user.user_id;
        await markAlertsRead(userId);
        res.json({ ok: true });
    } catch (err) {
        console.error("POST /api/me/alerts/read failed:", err);
        res.status(500).json({ error: "Could not update alerts" });
    }
});

// Business side --------------------------------------------------------
// Only the signed-in owner of :vendorId; admins cannot read or send a business's messages.

router.get("/vendors/:vendorId/conversations", ...vendorOwnerOnly, async (req, res) => {
    const vendorId = req.vendor.vendor_id;
    try {
        res.json(await listConversations({ vendorId, inquiriesOnly: req.query.type === "inquiries" }));
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/conversations failed:`, err);
        res.status(500).json({ error: "Could not load messages" });
    }
});

router.get("/vendors/:vendorId/conversations/:id", ...vendorOwnerOnly, async (req, res) => {
    const vendorId = req.vendor.vendor_id;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
        // Check the conversation belongs to this business before opening it, which marks messages read.
        const head = await conversationHead(id);
        if (!head || head.vendor_id !== vendorId) return res.status(404).json({ error: "Conversation not found" });
        const thread = await openConversation(id, req.user.user_id);
        if (!thread || thread.conversation.vendor_id !== vendorId) return res.status(404).json({ error: "Conversation not found" });
        res.json(thread);
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/conversations/${id} failed:`, err);
        res.status(500).json({ error: "Could not load the conversation" });
    }
});

router.post("/vendors/:vendorId/conversations/:id/messages", ...vendorOwnerOnly, async (req, res) => {
    const vendorId = req.vendor.vendor_id;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const parsed = parseBody(req.body?.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    try {
        const conversation = await conversationHead(id);
        if (!conversation || conversation.vendor_id !== vendorId) return res.status(404).json({ error: "Conversation not found" });
        if (conversation.conversation_status !== "open") return res.status(409).json({ error: "This conversation has been closed." });
        res.status(201).json(await addMessage(conversation, req.user.user_id, parsed.body, conversation.vendor_name));
    } catch (err) {
        console.error(`POST /api/vendors/${vendorId}/conversations/${id}/messages failed:`, err);
        res.status(500).json({ error: "Could not send the message. Try again." });
    }
});

router.get("/vendors/:vendorId/alerts", ...vendorOwnerOnly, async (req, res) => {
    const vendorId = req.vendor.vendor_id;
    try {
        res.json(await listAlerts(req.user.user_id));
    } catch (err) {
        console.error(`GET /api/vendors/${vendorId}/alerts failed:`, err);
        res.status(500).json({ error: "Could not load alerts" });
    }
});

router.post("/vendors/:vendorId/alerts/read", ...vendorOwnerOnly, async (req, res) => {
    const vendorId = req.vendor.vendor_id;
    try {
        await markAlertsRead(req.user.user_id);
        res.json({ ok: true });
    } catch (err) {
        console.error(`POST /api/vendors/${vendorId}/alerts/read failed:`, err);
        res.status(500).json({ error: "Could not update alerts" });
    }
});

module.exports = router;
