import axios from "axios";

const CHATWOOT_BASE = "https://app.chatwoot.com";
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;

const ACCOUNT_ID = 147542;
const INBOX_ID = 91192;

// Cache simple en memoria para no recrear conversaciones
const conversationCache = new Map();

export async function forwardToChatwoot(phone, name, text) {
    try {
        console.log("📤 Enviando a Chatwoot:", phone, name, text);

        // 1️⃣ Crear o encontrar contacto
        const contactRes = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
            {
                identifier: phone,
                name: name || phone,
                phone_number: phone
            },
            {
                headers: {
                    Authorization: `Bearer ${CHATWOOT_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const contactId = contactRes.data.payload.id;

        // 2️⃣ Obtener o crear conversación
        let conversationId = conversationCache.get(phone);

        if (!conversationId) {
            const convoRes = await axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
                {
                    source_id: phone,
                    inbox_id: INBOX_ID,
                    contact_id: contactId
                },
                {
                    headers: {
                        Authorization: `Bearer ${CHATWOOT_TOKEN}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            conversationId = convoRes.data.id;
            conversationCache.set(phone, conversationId);
        }

        // 3️⃣ Enviar mensaje a la conversación
        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
                content: text,
                message_type: "incoming"
            },
            {
                headers: {
                    Authorization: `Bearer ${CHATWOOT_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ Mensaje enviado a Chatwoot");

    } catch (error) {
        console.error(
            "❌ Error enviando a Chatwoot:",
            error.response?.data || error.message
        );
    }
}
