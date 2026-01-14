import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log(
            "💬 Chatwoot:",
            event.message_type,
            "|",
            event.sender?.type,
            "|",
            event.content
        );

        // Solo cuando un agente humano escribe
        if (event.event !== "message_created") return res.sendStatus(200);
        if (event.message_type !== "outgoing") return res.sendStatus(200);
        if (event.sender?.type !== "user") return res.sendStatus(200);

        const phone =
            event.conversation?.contact_inbox?.source_id ||
            event.conversation?.meta?.sender?.identifier;

        const text = event.content?.trim();

        if (!phone || !text) return res.sendStatus(200);

        console.log("👤 Agente → WhatsApp:", phone, ":", text);

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
