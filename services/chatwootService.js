import axios from "axios";
import FormData from 'form-data';
import 'dotenv/config';

const CHATWOOT_BASE = process.env.CHATWOOT_BASE; // https://app.chatwoot.com
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = Number(process.env.CHATWOOT_INBOX_ID);
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
        const existing = results.find(c => c.phone_number === e164);
        if (existing) {
            console.log(`✅ Contacto existente ID: ${existing.id} (${e164})`);
            return existing.id;
        }

        console.log(`✨ Creando contacto nuevo: ${e164}`);
        const res = await axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
            name: name || e164,
            phone_number: e164,
            identifier: e164
        }, { headers });

        const newId = res.data?.payload?.contact?.id;
        console.log(`✅ Contacto creado ID: ${newId}`);
        return newId;
    } catch (e) {
        if (e.response?.data?.message?.includes('already been taken')) {
            console.log("⚠️ Error duplicado, reintentando búsqueda...");
            const retry = await axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
                params: { q: e164 }, headers
            });
            const found = retry.data?.payload?.find(c => c.phone_number === e164);
            if (found) {
                console.log(`✅ Contacto encontrado en retry ID: ${found.id}`);
                return found.id;
            }
        }
        console.error("❌ Error getOrCreateContact:", e.response?.data || e.message);
        throw e;
    }
}

// ===============================
// 💬 CONVERSACIONES (FIXED)
// ===============================
async function getOrCreateConversation(e164, contactId) {
    // 1. Verificar caché
    if (conversationCache.has(e164)) {
        const cachedId = conversationCache.get(e164);
        console.log(`🔄 Usando conversación en caché: ${cachedId} para ${e164}`);
        return cachedId;
    }

    try {
        // 2. Buscar conversaciones del contacto (método correcto)
        console.log(`🔍 Buscando conversaciones del contacto ${contactId}...`);
        const res = await axios.get(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`,
            { headers }
        );

        const conversations = res.data?.payload || [];
        console.log(`📋 Encontradas ${conversations.length} conversaciones para contacto ${contactId}`);

        // 3. Buscar conversación abierta en el inbox correcto
        const existingConvo = conversations.find(c => {
            const isCorrectInbox = Number(c.inbox_id) === INBOX_ID;
            const isOpen = c.status !== 'resolved';

            if (isCorrectInbox && isOpen) {
                console.log(`   ✓ Conversación ${c.id}: inbox=${c.inbox_id}, status=${c.status}`);
            }

            return isCorrectInbox && isOpen;
        });

        if (existingConvo) {
            conversationCache.set(e164, existingConvo.id);
            console.log(`✅ Conversación encontrada y cacheada: ${existingConvo.id}`);
            return existingConvo.id;
        }

        // 4. Si no existe, crear nueva
        console.log(`✨ No hay conversación abierta. Creando nueva...`);
        const convo = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
            {
                source_id: e164,
                inbox_id: INBOX_ID,
                contact_id: contactId,
                status: "open"
            },
            { headers }
        );

        const convoId = convo.data?.id;
        conversationCache.set(e164, convoId);
        console.log(`✅ Conversación creada y cacheada: ${convoId}`);
        return convoId;

    } catch (error) {
        console.error("❌ Error getOrCreateConversation:", error.response?.data || error.message);
        console.error("   Stack:", error.stack);
        return null;
    }
}

/**
 * 📥 WhatsApp → Chatwoot (mensaje del cliente)
 */
export async function forwardToChatwoot(phone, name, messageObject) {
    try {
        console.log(`📥 forwardToChatwoot: ${phone} → "${messageObject.text?.body?.substring(0, 30) || messageObject.type}"`);

        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, name);
        if (!contactId) {
            console.error("❌ No se pudo obtener contactId, abortando");
            return;
        }

        const conversationId = await getOrCreateConversation(e164, contactId);
        if (!conversationId) {
            console.error("❌ No se pudo obtener conversationId, abortando");
            return;
        }

        const type = messageObject.type;
        const supportedMedia = ["image", "audio", "document", "video"];

        // --- 📂 MULTIMEDIA ---
        if (supportedMedia.includes(type)) {
            const mediaData = messageObject[type];
            const caption = mediaData.caption || "";

            console.log(`📎 Procesando multimedia tipo: ${type}`);

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
            console.log(`✅ Multimedia enviado a Chatwoot`);
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
            console.log(`✅ Mensaje del cliente enviado: "${content.substring(0, 50)}"`);
        }
    } catch (err) {
        console.error("❌ Error forwardToChatwoot:", err.response?.data || err.message);
        console.error("   Stack:", err.stack);
    }
}

/**
 * 📤 Bot → Chatwoot (mensaje del bot)
 */
export async function sendBotMessageToChatwoot(phone, text) {
    try {
        console.log(`📤 sendBotMessageToChatwoot: ${phone} → "${text.substring(0, 30)}"`);

        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);
        if (!contactId) return;

        const conversationId = await getOrCreateConversation(e164, contactId);
        if (!conversationId) return;

        const res = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            { content: text, message_type: "outgoing", private: false },
            { headers }
        );

        if (res.data?.id) {
            lastSentMessages.add(res.data.id);
            setTimeout(() => lastSentMessages.delete(res.data.id), 10000);
            console.log(`✅ Mensaje del bot enviado a Chatwoot`);
        }
    } catch (err) {
        console.error("❌ Error sendBotMessageToChatwoot:", err.response?.data || err.message);
        console.error("   Stack:", err.stack);
    }
}