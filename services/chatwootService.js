import axios from "axios";
import FormData from 'form-data';
import 'dotenv/config';

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
// Forzamos conversión a número para evitar errores de comparación
const INBOX_ID = Number(process.env.INBOX_ID);
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

export const lastSentMessages = new Set();
const conversationCache = new Map();

function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");
    if (p.length === 10 && p.startsWith("3")) p = "57" + p;
    if (!p.startsWith("57") || p.length !== 12) throw new Error("Número inválido: " + phone);
    return "+" + p;
}

// ===============================
// 👤 CONTACTOS
// ===============================
async function getOrCreateContact(e164, name) {
    try {
        const search = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
            params: { q: e164 }, headers
        });

        const results = search.data?.payload || [];
        // Búsqueda estricta para evitar falsos positivos
        const existing = results.find(c => c.phone_number === e164);
        if (existing) return existing.id;

        const res = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
            name: name || e164,
            phone_number: e164,
            identifier: e164
        }, { headers });

        return res.data?.payload?.contact?.id;
    } catch (e) {
        // Fallback: si falla por duplicado, intentamos buscar de nuevo
        if (e.response?.data?.message?.includes('exist')) {
            const retry = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
                params: { q: e164 }, headers
            });
            return retry.data?.payload?.[0]?.id;
        }
        console.error("❌ Error Contacto:", e.message);
        throw e;
    }
}

// ===============================
// 💬 CONVERSACIONES (BLINDADO)
// ===============================
async function getOrCreateConversation(e164, contactId) {
    if (conversationCache.has(e164)) return conversationCache.get(e164);

    try {
        // 1. Buscamos conversaciones directamente vinculadas al CONTACTO
        // Esto es mucho más preciso que buscar en toda la cuenta
        const res = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`, {
            headers
        });

        const conversations = res.data?.payload || [];

        // Buscamos la que pertenezca a nuestro Inbox y no esté resuelta
        const existingConvo = conversations.find(c =>
            Number(c.inbox_id) === INBOX_ID && c.status !== 'resolved'
        );

        if (existingConvo) {
            conversationCache.set(e164, existingConvo.id);
            return existingConvo.id;
        }

        // 2. Si no existe, la creamos. 
        // TIP: Si falla aquí, el problema es que el INBOX_ID (91455) no es tipo API.
        const convo = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`, {
            source_id: e164,
            inbox_id: INBOX_ID,
            contact_id: contactId,
            status: "open"
        }, { headers });

        // IMPORTANTE: En la creación, Chatwoot devuelve el objeto dentro de 'data' o 'payload'
        const convoId = convo.data?.id || convo.data?.payload?.id;

        conversationCache.set(e164, convoId);
        return convoId;

    } catch (error) {
        console.error("❌ Error Crítico en getOrCreateConversation:", error.response?.status, error.response?.data);
        return null;
    }
}

/**
 * 📥 RECEPTOR: WhatsApp -> Chatwoot
 */
export async function forwardToChatwoot(phone, name, messageObject) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, name);
        if (!contactId) return; // Evita crash si falla contacto

        const conversationId = await getOrCreateConversation(e164, contactId);
        if (!conversationId) return;

        const type = messageObject.type;
        const supportedMedia = ["image", "audio", "document", "video"];

        // --- 📂 MULTIMEDIA ---
        if (supportedMedia.includes(type)) {
            const mediaData = messageObject[type];
            const caption = mediaData.caption || "";

            const mediaMeta = await axios.get(`https://graph.facebook.com/v20.0/${mediaData.id}`, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
            });

            const fileStream = await axios.get(mediaMeta.data.url, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
                responseType: 'arraybuffer'
            });

            const form = new FormData();
            form.append('content', caption);
            form.append('message_type', 'incoming');

            const extension = mediaMeta.data.mime_type.split('/')[1] || 'bin';
            const fileName = mediaData.filename || `whatsapp_${type}_${Date.now()}.${extension}`;

            form.append('attachments[]', Buffer.from(fileStream.data), {
                filename: fileName,
                contentType: mediaMeta.data.mime_type
            });

            await axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
                form,
                { headers: { ...headers, ...form.getHeaders() } }
            );
            return;
        }

        // --- 💬 TEXTO ---
        let content = messageObject.text?.body;
        if (!content && messageObject.interactive) {
            const reply = messageObject.interactive.button_reply || messageObject.interactive.list_reply;
            content = reply?.title || "Selección de menú";
        }

        if (content) {
            await axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
                { content: content, message_type: "incoming" },
                { headers }
            );
        }
    } catch (err) {
        console.error("❌ Error forwardToChatwoot:", err.message);
    }
}

export async function sendBotMessageToChatwoot(phone, text) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        const res = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            { content: text, message_type: "outgoing", private: false },
            { headers }
        );

        if (res.data?.id) {
            lastSentMessages.add(res.data.id);
            setTimeout(() => lastSentMessages.delete(res.data.id), 10000);
        }
    } catch (err) {
        console.error("❌ Error sendBotMessageToChatwoot:", err.message);
    }
}