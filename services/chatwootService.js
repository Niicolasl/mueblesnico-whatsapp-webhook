import axios from "axios";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;

const conversationCache = new Map();

const headers = {
    "api_access_token": CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

function toE164(phone) {
    let p = phone.replace(/\D/g, ""); // quitar todo lo que no sea número

    // Si viene sin país, asumimos Colombia
    if (p.length === 10 && p.startsWith("3")) {
        p = "57" + p;
    }

    if (!p.startsWith("57")) {
        throw new Error("Número inválido: " + phone);
    }

    return "+" + p;
}

export async function forwardToChatwoot(phone, name, text) {
    try {
        const e164 = toE164(phone);

        console.log("📤 Enviando a Chatwoot:", e164, name, text);

        // 1️⃣ Crear o encontrar contacto
        const contactRes = await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
            {
                identifier: e164,
                name: name || e164,
                phone_number: e164,
            },
            { headers }
        );

        const contactId = contactRes.data.payload.contact.id;

        // 2️⃣ Obtener o crear conversación
        let conversationId = conversationCache.get(e164);

        if (!conversationId) {
            const convoRes = await axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
                {
                    inbox_id: INBOX_ID,
                    contact_id: contactId,
                    source_id: e164,
                },
                { headers }
            );

            conversationId = convoRes.data.id;
            conversationCache.set(e164, conversationId);
        }

        // 3️⃣ Enviar mensaje
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
