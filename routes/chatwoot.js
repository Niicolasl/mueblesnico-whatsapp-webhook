import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 1. Solo mensajes salientes
        if (event.event !== "message_created" || event.message_type !== "outgoing") {
            return res.sendStatus(200);
        }

        // 2. FILTRO DE BOT MEJORADO
        // Ignorar si tiene marca 'from_bot' O si el remitente es tipo 'bot'
        const isBot = event.additional_attributes?.from_bot === true || event.sender?.type === "bot";

        if (isBot) {
            console.log("⏭️ Filtrando mensaje automático (Bot)");
            return res.sendStatus(200);
        }

        // 3. Extraer destinatario (source_id es el teléfono con +57)
        const sourceId = event.conversation?.contact_inbox?.source_id;

        // 4. Si el mensaje NO TIENE contenido de texto (es interactivo/bot), ignorar
        // Los agentes humanos siempre escriben texto plano.
        if (!sourceId || !event.content) {
            return res.sendStatus(200);
        }

        const text = event.content.trim();

        console.log("👤 Agente Humano -> WhatsApp:", sourceId);

        await sendMessage(sourceId, {
            text: { body: text }
        });

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(200); // Siempre responder 200 para evitar reintentos de Chatwoot
    }
});

export default router;