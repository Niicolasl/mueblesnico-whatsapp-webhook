import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 1. Filtros de seguridad básicos
        if (event.event !== "message_created") return res.sendStatus(200);
        if (event.message_type !== "outgoing") return res.sendStatus(200);

        // 2. EVITAR LOOP: Si el mensaje lo creó un BOT o no es un usuario humano, ignorar.
        if (event.sender?.bot || event.sender?.type !== "user") {
            return res.sendStatus(200);
        }

        const sourceId = event.conversation?.contact_inbox?.source_id;
        const text = event.content?.trim();

        if (!sourceId || !text) return res.sendStatus(200);

        console.log("👤 Agente Humano -> WhatsApp:", sourceId, ":", text);

        // ✅ Enviar a WhatsApp
        await sendMessage(sourceId, {
            text: { body: text }
        });

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(500);
    }
});

export default router;