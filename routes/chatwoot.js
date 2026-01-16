import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 1. Solo procesar mensajes que salen de Chatwoot hacia el cliente
        if (event.event !== "message_created" || event.message_type !== "outgoing") {
            return res.sendStatus(200);
        }

        // 2. 🔥 ROMPER EL BUCLE (Eco Check)
        // Revisamos si el mensaje tiene la marca 'from_bot' que pusimos en chatwootService.js
        const isBot = event.additional_attributes?.from_bot === true;

        if (isBot) {
            console.log("⏭️ Eco del Bot detectado. Ignorando para evitar bucle.");
            return res.sendStatus(200);
        }

        // 3. Extraer datos
        const sourceId = event.conversation?.contact_inbox?.source_id;
        const text = event.content?.trim();

        if (!sourceId || !text) return res.sendStatus(200);

        // 4. Doble seguridad: Si el texto es un saludo automático, ignorar
        if (text.includes("Espero que estés muy bien") || text.includes("Escribe *Menú*")) {
            return res.sendStatus(200);
        }

        console.log("👤 Agente Humano Manual -> WhatsApp:", sourceId);

        // ✅ Enviar a WhatsApp (Solo llega aquí si tú escribiste manual en el panel)
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