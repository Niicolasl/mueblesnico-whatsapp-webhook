import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log(
            "💬 Chatwoot:",
            event.event,
            "|",
            event.message_type,
            "|",
            event.sender?.type,
            "|",
            event.content
        );

        // Solo cuando se crea un mensaje
        if (event.event !== "message_created") return res.sendStatus(200);

        // Solo mensajes que salen de Chatwoot
        if (event.message_type !== "outgoing") return res.sendStatus(200);

        // 🛑 Ignorar mensajes enviados por el BOT (firmados)
        if (event.additional_attributes?.from_bot === true) {
            console.log("⏭ Ignorado (mensaje del BOT)");
            return res.sendStatus(200);
        }

        // Solo mensajes escritos por humanos
        if (event.sender?.type !== "user") {
            console.log("⏭ Ignorado (no humano):", event.sender?.type);
            return res.sendStatus(200);
        }

        const phone =
            event.conversation?.contact_inbox?.source_id ||
            event.conversation?.meta?.sender?.identifier;

        const text = event.content?.trim();

        if (!phone || !text) return res.sendStatus(200);

        console.log("👤 Agente humano → WhatsApp:", phone, ":", text);

        await sendMessage(phone, {
            text: { body: text }
        });

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.response?.data || err.message);
        return res.sendStatus(500);
    }
});

export default router;
