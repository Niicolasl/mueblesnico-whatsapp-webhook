import axios from "axios";
import FormData from 'form-data';
import 'dotenv/config';

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.INBOX_ID; // Asegúrate de que este ID sea el correcto del Inbox de WhatsApp en Chatwoot
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
// 👤 CONTACTOS: Identificación única
// ===============================
async function getOrCreateContact(e164, name) {
    const search = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
        params: { q: e164 }, headers
    });

    const results = search.data?.payload || [];
    if (results.length > 0) return results[0].id;

    const res = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
        name: name || e164,
        phone_number: e164,
        identifier: e164 // Clave para evitar duplicidad de perfiles
    }, { headers });

    return res.data?.payload?.contact?.id;
}

// ===============================
// 💬 CONVERSACIONES: Una por cada número
// ===============================
async function getOrCreateConversation(e164, contactId) {
    if (conversationCache.has(e164)) return conversationCache.get(e164);

    // Buscar conversaciones abiertas específicas de ESTE contacto
    const res = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`, {
        headers
    });

    const conversations = res.data?.payload || [];
    const open = conversations.find(c => c.status === "open" && c.inbox_id == INBOX_ID);

    if (open) {
        conversationCache.set(e164, open.id);
        return open.id;
    }

    // Crear nueva conversación con source_id único (el teléfono)
    const convo = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`, {
        source_id: e164,
        inbox_id: INBOX_ID,
        contact_id: contactId
    }, { headers });

    const convoId = convo.data?.id; // Nota: en creación directa suele ser .id
    conversationCache.set(e164, convoId);
    return convoId;
}

/**
 * 📥 RECEPTOR: WhatsApp -> Chatwoot
 */
export async function forwardToChatwoot(phone, name, messageObject) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, name);
        const conversationId = await getOrCreateConversation(e164, contactId);

        // --- CASO IMAGEN ---
        if (messageObject.type === "image") {
            const mediaId = messageObject.image.id;
            const caption = messageObject.image.caption || "";

            const mediaMeta = await axios.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
            });

            const fileStream = await axios.get(mediaMeta.data.url, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
                responseType: 'arraybuffer'
            });

            const form = new FormData();
            form.append('content', caption);
            form.append('message_type', 'incoming');
            form.append('attachments[]', Buffer.from(fileStream.data), {
                filename: 'whatsapp_image.jpg',
                contentType: 'image/jpeg'
            });

            await axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
                form,
                { headers: { ...headers, ...form.getHeaders() } }
            );
            return;
        }

        // --- CASO TEXTO O INTERACTIVO ---
        let content = messageObject.text?.body;

        // Si es una respuesta de botón o lista, también lo enviamos como texto a Chatwoot
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

/**
 * 🤖 BOT: Espeja lo que el BOT dice en Chatwoot
 */
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