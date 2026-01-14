import axios from "axios";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;

/**
 * Cache local:
 * "+573204128555" => conversation_id
 */
const conversationCache = new Map();

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

// ========================================
// 🔧 Debug de entorno
// ========================================
console.log("CHATWOOT CONFIG:");
console.log("BASE:", CHATWOOT_BASE);
console.log("ACCOUNT_ID:", ACCOUNT_ID);
console.log("INBOX_ID:", INBOX_ID);
console.log("TOKEN:", CHATWOOT_TOKEN ? "OK" : "MISSING");

// ========================================
// 📞 Normalización teléfono
// ========================================

function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");

    if (p.length === 10 && p.startsWith("3")) {
        p = "57" + p;
    }

    if (!p.startsWith("57") || p.length !== 12) {
        throw new Error("Número inválido: " + phone);
    }

    return "+" + p;
}

// ========================================
// 👤 CONTACTOS
// ========================================

async function getOrCreateContact(e164, name) {
    const search = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(e164)}`,
        { headers }
    );

    if (Array.isArray(search.data?.payload) && search.data.payload.length > 0) {
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

// ========================================
// 💬 CONVERSACIONES (Chatwoot Cloud safe)
// ========================================

async function getOrCreateConversation(e164, contactId) {
    if (conversationCache.has(e164)) {
        return conversationCache.get(e164);
    }

    // Buscar conversaciones existentes
    const res = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
            params: {
                inbox_id: INBOX_ID,
                contact_id: contactId,
            },
            headers,
        }
    );

    const conversations = res.data?.data?.payload || [];

    const existing = conversations.find(c => c.source_id === e164);

    if (existing) {
        conversationCache.set(e164, existing.id);
        return existing.id;
    }

    // Crear nueva conversación
    const convo = await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
            inbox_id: INBOX_ID,
            contact_id: contactId,
            source_id: e164,
        },
        { headers }
    );

    const convoId =
        convo.data?.data?.payload?.id ||
        convo.data?.payload?.id ||
        convo.data?.id;

    console.log("🧩 Chatwoot conversation_id:", convoId);

    if (!convoId || typeof convoId !== "number") {
        console.error("❌ Respuesta Chatwoot:", JSON.stringify(convo.data, null, 2));
        throw new Error("Chatwoot no devolvió conversation_id válido");
    }

    conversationCache.set(e164, convoId);
    return convoId;
}

// ========================================
// 📥 CLIENTE → CHATWOOT
// ========================================

export async function forwardToChatwoot(phone, name, text) {
    try {
        const e164 = toE164(phone);

        console.log("📥 Cliente → Chatwoot:", e164, ":", text);

        const contactId = await getOrCreateContact(e164, name);
        const conversationId = await getOrCreateConversation(e164, contactId);

        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
                content: text,
                message_type: "incoming",
            },
            { headers }
        );
    } catch (err) {
        console.error("❌ Chatwoot CLIENTE:", err.response?.data || err.message);
    }
}

// ========================================
// 🤖 BOT → CHATWOOT
// ========================================

export async function sendBotMessageToChatwoot(phone, text) {
    try {
        const e164 = toE164(phone);

        console.log("🤖 Bot → Chatwoot:", e164, ":", text);

        const contactId = await getOrCreateContact(e164, e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        console.log("🧩 Bot usando conversation_id:", conversationId);

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
