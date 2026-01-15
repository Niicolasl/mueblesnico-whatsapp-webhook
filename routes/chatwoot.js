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
            event.sender?.bot,
            "|",
            event.content
        );

        // Solo mensajes creados
        if (event.event !== "message_created") return res.sendStatus(200);

        // Solo outgoing (agente → cliente)
        if (event.message_type !== "outgoing") return res.sendStatus(200);

        // 🔹 EVITAR LOOP: Solo permitir mensajes de AGENTES HUMANOS
        if (event.sender?.type !== "user") {
            console.log("⏭ Ignorado: No es un agente humano (evitando loop del bot)");
            return res.sendStatus(200);
        }

        // Solo si viene de WhatsApp real
        const sourceId = event.conversation?.contact_inbox?.source_id;
        if (!sourceId) {
            console.log("⏭ Ignorado (mensaje sin sourceId / no WhatsApp)");
            return res.sendStatus(200);
        }

        const phone = sourceId;
        const text = event.content?.trim();
        if (!phone || !text) return res.sendStatus(200);

        console.log("👤 Agente → WhatsApp:", phone, ":", text);

        // ✅ Enviar mensaje a WhatsApp
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
