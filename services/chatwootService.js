import axios from "axios";
import FormData from 'form-data';
import 'dotenv/config';

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = Number(process.env.INBOX_ID); // 👈 Forzamos a número para evitar errores
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

export const lastSentMessages = new Set();
// Aunque se reinicie el servidor, la lógica de abajo nos salvará.
const conversationCache = new Map();

function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");
    if (p.length === 10 && p.startsWith("3")) p = "57" + p;
    if (!p.startsWith("57") || p.length !== 12) throw new Error("Número inválido: " + phone);
    return "+" + p;
}

// ===============================
// 👤 CONTACTOS: Búsqueda exacta
// ===============================
async function getOrCreateContact(e164, name) {
    try {
        const search = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
            params: { q: e164 }, headers
        });

        const results = search.data?.payload || [];

        // Buscamos coincidencia EXACTA de teléfono para no mezclar contactos
        const existingContact = results.find(c => c.phone_number === e164);
        if (existingContact) return existingContact.id;

        // Si no existe, crear
        const res = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
            name: name || e164,
            phone_number: e164,
            identifier: e164
        }, { headers });

        return res.data?.payload?.contact?.id;
    } catch (error) {
        console.error("❌ Error Contacto:", error.response?.data || error.message);
        // Fallback: Si falla la creación (ej. duplicado que la búsqueda no vio), intentamos buscar de nuevo
        if (error.response?.data?.message?.includes('exist')) {
            const retrySearch = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
                params: { q: e164 }, headers
            });
            return retrySearch.data?.payload?.[0]?.id;
        }
        throw error;
    }
}

// ===============================
// 💬 CONVERSACIONES: Recuperación robusta
// ===============================
async function getOrCreateConversation(e164, contactId) {
    // 1. Revisar memoria (rápido, pero se borra al reiniciar)
    if (conversationCache.has(e164)) return conversationCache.get(e164);

    try {
        // 2. Buscar en la API conversaciones de este contacto
        const res = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`, {
            headers
        });

        const conversations = res.data?.payload || [];

        // 🔎 BUSCAR SI YA EXISTE UNA ABIERTA O PENDIENTE
        // Comparamos Number(inbox_id) para asegurar que coincida aunque uno sea string y otro int
        const open = conversations.find(c =>
            (c.status === "open" || c.status === "pending") &&
            Number(c.inbox_id) === INBOX_ID
        );

        if (open) {
            console.log(`🔄 Conversación existente encontrada: ${open.id}`);
            conversationCache.set(e164, open.id);
            return open.id;
        }

        // 3. Si no hay ninguna activa, CREAR NUEVA
        console.log("✨ Creando nueva conversación...");
        const convo = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`, {
            source_id: e164,
            inbox_id: INBOX_ID,
            contact_id: contactId,
            status: "open"
        }, { headers });

        const convoId = convo.data?.id;
        conversationCache.set(e164, convoId);
        return convoId;

    } catch (error) {
        console.error("❌ Error Conversación:", error.response?.data || error.message);
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
        if (!contactId) return;

        const conversationId = await getOrCreateConversation(e164, contactId);
        if (!conversationId) return;

        const type = messageObject.type;
        const supportedMedia = ["image", "audio", "document", "video"];

        // --- 📂 CASO MULTIMEDIA ---
        if (supportedMedia.includes(type)) {
            const mediaData = messageObject[type];
            const mediaId = mediaData.id;
            const caption = mediaData.caption || "";

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

        // --- 💬 CASO TEXTO ---
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

/**
 * 🤖 BOT: Espeja mensajes del BOT
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