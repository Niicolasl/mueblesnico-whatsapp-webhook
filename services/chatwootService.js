import axios from "axios";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;       // ej: https://summarisable-cami-unneglectfully.ngrok-free.dev
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN; // ej: npgv8Dr5ppAxHhf69ovCqa7j
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;   // ej: 2
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;       // ej: 1

// Cache simple en memoria para no recrear conversaciones
const conversationCache = new Map();

const headers = {
    "api_access_token": CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

export async function forwardToChatwoot(phone, name, text) {
    try {
        console.log("📤 Enviando a Chatwoot:", phone, name, text);

        // 1️⃣ Crear o encontrar contacto
        const contactRes = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
            {
                identifier: phone,
                name: name || phone,
                phone_number: phone,
            },
            { headers }
        );

        const contactId = contactRes.data.payload.contact.id;

        // 2️⃣ Obtener o crear conversación
        let conversationId = conversationCache.get(phone);

        if (!conversationId) {
            const convoRes = await axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
                {
                    inbox_id: INBOX_ID,
                    contact_id: contactId,
                    source_id: phone,
                },
                { headers }
            );

            conversationId = convoRes.data.id;
            conversationCache.set(phone, conversationId);
        }

        // 3️⃣ Enviar mensaje entrante a la conversación
        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
                content: text,
                message_type: "incoming",
            },
            { headers }
        );

        console.log("✅ Mensaje enviado a Chatwoot");
    } catch (error) {
        console.error("❌ Error Chatwoot:", error.response?.data || error.message);
    }
}
