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

        // 2. 🔥 FILTRO ANTI-BUCLE ULTRA (Si el remitente es Bot o es un mensaje automatizado)
        const isBot = event.additional_attributes?.from_bot === true ||
            event.sender?.type === "bot" ||
            !event.sender; // Los mensajes de sistema a veces no tienen sender

        // 3. 🔥 FILTRO DE CONTENIDO (Si el texto coincide con lo que envía el bot)
        const text = event.content?.trim() || "";
        const esMensajeBot = [
            "Espero que estés muy bien",
            "Escribe *Menú*",
            "¿Qué es lo que necesitas hacer?",
            "Ten en cuenta que",
            "Un asesor te contactará"
        ].some(frase => text.includes(frase));

        if (isBot || esMensajeBot) {
            console.log("⏭️ Filtrando eco del Bot detectado en el contenido.");
            return res.sendStatus(200);
        }

        const sourceId = event.conversation?.contact_inbox?.source_id;
        if (!sourceId || !text) return res.sendStatus(200);

        console.log("👤 Agente Humano Manual -> WhatsApp:", sourceId);

        await sendMessage(sourceId, { text: { body: text } });

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(200);
    }
});

export default router;