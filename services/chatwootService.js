import axios from "axios";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE; // https://app.chatwoot.com
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;

/**
 * Cache local de conversaciones
 * phone(E164) => conversation_id
 */
const conversationCache = new Map();

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

/**
 * Convierte cualquier número a E.164 Colombia
 * Recibe: 3204128555 | 573204128555 | +573204128555
 * Devuelve: +573204128555
 */
function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");

    if (p.length === 10 && p.startsWith("3")) {
        p = "57" + p;
    }

    if (!p.startsWith("57") || p.length < 12) {
        throw new Error("Número inválido: " + phone);
    }

    return "+" + p;
}

/**
 * Busca o crea un contacto
 */
async function getOrCreateContact(e164, name) {
    try {
        // 🔍 Buscar primero
        const search = await axios.get(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(
                e164
            )}`,
            { headers }
        );

        if (search.data?.payload?.length > 0) {
            return search.data.payload[0].id;
        }
    } catch (_) { }

    // ➕ Crear si no existe
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

/**
 * Busca o crea conversación
 */
async function getOrCreateConversation(e164, contactId) {
    // Cache local
    if (conversationCache.has(e164)) {
        return conversationCache.get(e164);
    }

    // Buscar en Chatwoot (Cloud)
    const search = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations?inbox_id=${INBOX_ID}&contact_id=${contactId}`,
        { headers }
    );

    const conversations = search.data?.data?.payload || [];

    const existing = conversations.find(
        (c) => c.meta?.sender?.phone_number === e164
    );

    if (existing) {
        conversationCache.set(e164, existing.id);
        return existing.id;
    }

    // Crear nueva
    const convo = await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
            inbox_id: INBOX_ID,
            contact_id: contactId,
            source_id: e164,
        },
        { headers }
    );

    const id = convo.data.id;
    conversationCache.set(e164, id);
    return id;
}


/**
 * 📥 CLIENTE → Chatwoot
 */
export async function forwardToChatwoot(phone, name, text) {
    try {
        const e164 = toE164(phone);

        console.log("📥 Cliente → Chatwoot:", e164, text);

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
    } catch (error) {
        console.error(
            "❌ Chatwoot CLIENTE:",
            error.response?.data || error.message
        );
    }
}

/**
 * 🤖 BOT → Chatwoot
 */
export async function sendBotMessageToChatwoot(phone, text) {
    try {
        const e164 = toE164(phone);

        const contactId = await getOrCreateContact(e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        console.log("🤖 Bot → Chatwoot:", e164, text);

        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
                content: text,
                message_type: "outgoing",
                private: false,
            },
            { headers }
        );
    } catch (error) {
        console.error(
            "❌ Chatwoot BOT:",
            error.response?.data || error.message
        );
    }
}
