import axios from "axios";

const CHATWOOT_BASE = "https://app.chatwoot.com";
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const INBOX_IDENTIFIER = "QyiB2peSDJLcppuys8pVYAp2";

export async function forwardToChatwoot(phone, name, text) {
    try {
        // 1) Crear o actualizar contacto
        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/147542/contacts`,
            {
                name: name || phone,
                identifier: phone
            },
            {
                headers: {
                    Authorization: `Bearer ${CHATWOOT_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        // 2) Crear conversación si no existe
        // Chatwoot internamente la crea al mandar mensaje

        // 3) Mandar el mensaje
        await axios.post(
            `${CHATWOOT_BASE}/api/v1/accounts/147542/inboxes/${INBOX_IDENTIFIER}/messages`,
            {
                content: text,
                message_type: "incoming",
                // Identificador del cliente
                sender: {
                    // Este debe ser el identificador que usamos para crear el contacto
                    identifier: phone,
                    name: name,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${CHATWOOT_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

    } catch (error) {
        console.error("❌ Error enviando a Chatwoot:", error.response?.data || error);
    }
}
