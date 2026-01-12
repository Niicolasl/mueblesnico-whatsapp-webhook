import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // Solo mensajes creados
        if (event.event !== "message_created") return res.sendStatus(200);

        // Queremos SOLO mensajes de AGENTE (humano)
        if (event.message_type !== "outgoing") return res.sendStatus(200);

        const text = event.content;
        const phone = event.conversation?.contact_inbox?.contact?.identifier;

        if (!phone || !text) {
            return res.sendStatus(200);
        }

        console.log("👤 HUMANO EN CHATWOOT DICE:", text, "PARA:", phone);

        // Envia por WhatsApp
        await sendMessage(phone, {
            text: { body: text },
        });

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
