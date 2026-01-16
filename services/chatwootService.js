import axios from "axios";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

// 🛡️ Memoria para evitar bucles (Eco-cancelación)
export const lastSentMessages = new Set();

const conversationCache = new Map();

function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");
    if (p.length === 10 && p.startsWith("3")) p = "57" + p;
    if (!p.startsWith("57") || p.length !== 12) {
        throw new Error("Número inválido: " + phone);
    }
    return "+" + p;
}

async function getOrCreateContact(e164, name) {
    const search = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`,
        { params: { q: e164 }, headers }
    );
    const results = search.data?.payload || [];
    if (results.length > 0) return results[0].id;

    const res = await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
        { name: name || e164, phone_number: e164 },
        { headers }
    );
    return res.data?.payload?.contact?.id;
}

async function getOrCreateConversation(e164, contactId) {
    if (conversationCache.has(e164)) return conversationCache.get(e164);

    const res = await axios.get(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        { params: { inbox_id: INBOX_ID, contact_id: contactId }, headers }
    );
    const conversations = res.data?.data?.payload || [];
    const open = conversations.find(c => c.status === "open");

    if (open) {
        conversationCache.set(e164, open.id);
        return open.id;
    }

    const convo = await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        { inbox_id: INBOX_ID, contact_id: contactId },
        { headers }
    );
    const convoId = convo.data?.data?.payload?.id;
    conversationCache.set(e164, convoId);
    return convoId;
}

export async function forwardToChatwoot(phone, name, text) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, name);
        const conversationId = await getOrCreateConversation(e164, contactId);

        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            { content: text, message_type: "incoming" },
            { headers }
        );
    } catch (err) {
        console.error("❌ Chatwoot CLIENTE:", err.message);
    }
}

export async function sendBotMessageToChatwoot(phone, text) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        const res = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
                content: text,
                message_type: "outgoing",
                private: false,
            },
            { headers }
        );

        // 🔥 REGISTRAMOS EL ID DEL MENSAJE PARA IGNORARLO EN EL WEBHOOK
        const msgId = res.data?.id;
        if (msgId) {
            lastSentMessages.add(msgId);
            // Limpiar después de 10 segundos para no llenar la RAM
            setTimeout(() => lastSentMessages.delete(msgId), 10000);
        }

    } catch (err) {
        console.error("❌ Chatwoot BOT:", err.message);
    }
}