import axios from "axios";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

// Cache: "+573204128555" → conversation_id
const conversationCache = new Map();

// ===============================
// 📞 Normalizar teléfono
// ===============================
function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");
    if (p.length === 10 && p.startsWith("3")) p = "57" + p;
    if (!p.startsWith("57") || p.length !== 12) {
        throw new Error("Número inválido: " + phone);
    }
    return "+" + p;
}

// ===============================
// 👤 Contactos
// ===============================
async function getOrCreateContact(e164, name) {
    const search = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(e164)}`,
        { headers }
    );

    if (search.data?.payload?.length) {
        return search.data.payload[0].id;
    }

    const res = await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
        {
            name: name || e164,
            identifier: e164,
            phone_number: e164,
        },
        { headers }
    );

    return res.data.payload.contact.id;
}

// ===============================
// 💬 Conversaciones
// ===============================
async function getOrCreateConversation(e164, contactId) {
    if (conversationCache.has(e164)) {
        return conversationCache.get(e164);
    }

    const res = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
            params: { inbox_id: INBOX_ID, contact_id: contactId },
            headers,
        }
    );

    const existing = res.data?.data?.payload?.find(c => c.source_id === e164);
    if (existing) {
        conversationCache.set(e164, existing.id);
        return existing.id;
    }

    const convo = await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
            inbox_id: INBOX_ID,
            contact_id: contactId,
            source_id: e164,
        },
        { headers }
    );

    const convoId = convo.data?.data?.payload?.id;
    if (!convoId) {
        console.error("❌ Chatwoot respondió:", convo.data);
        throw new Error("No conversation_id");
    }

    conversationCache.set(e164, convoId);
    console.log("🧩 Chatwoot conversation_id:", convoId);
    return convoId;
}

// ===============================
// 📥 Cliente → Chatwoot
// ===============================
export async function forwardToChatwoot(phone, name, text) {
    try {
        const e164 = toE164(phone);
        console.log("📥 Cliente → Chatwoot:", e164, ":", text);

        const contactId = await getOrCreateContact(e164, name);
        const conversationId = await getOrCreateConversation(e164, contactId);

        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            { content: text, message_type: "incoming" },
            { headers }
        );
    } catch (err) {
        console.error("❌ Chatwoot CLIENTE:", err.response?.data || err.message);
    }
}

// ===============================
// 🤖 Bot → Chatwoot
// ===============================
export async function sendBotMessageToChatwoot(phone, text) {
    try {
        const e164 = toE164(phone);
        console.log("🤖 Bot → Chatwoot:", e164, ":", text);

        const contactId = await getOrCreateContact(e164, e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
                content: text,
                message_type: "outgoing",
                private: false,
            },
            { headers }
        );

        console.log("✅ Bot → Chatwoot enviado");
    } catch (err) {
        console.error("❌ Chatwoot BOT:", err.response?.data || err.message);
    }
}
