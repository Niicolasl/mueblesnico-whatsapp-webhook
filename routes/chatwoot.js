// routes/chatwoot.js
import express from "express";
import { sendMessage } from "../services/whatsappSender.js";
import { telefonoParaWhatsApp } from "../utils/phone.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 🔹 Log completo del evento para depuración
        console.log("💬 Webhook Chatwoot recibe:", JSON.stringify(event, null, 2));

        // Solo procesamos mensajes creados
        if (event.event !== "message_created") return res.sendStatus(200);

        // Solo queremos los mensajes de AGENTE (humano), no del cliente
        if (event.message_type !== "outgoing") return res.sendStatus(200);

        // Extraer contenido del mensaje
        const text = event.content?.trim();
        if (!text) {
            console.warn("⚠️ Mensaje vacío de Chatwoot");
            return res.sendStatus(200);
        }

        // Extraer número del contacto (estructura según Chatwoot)
        const phoneRaw =
            event.conversation?.contact_inbox?.contact?.identifier ||
            event.conversation?.meta?.sender_identifier;

        if (!phoneRaw) {
            console.warn("⚠️ No se encontró número de contacto en el evento");
            return res.sendStatus(200);
        }

        // Normalizar número para WhatsApp
        const phone = telefonoParaWhatsApp(phoneRaw);

        console.log("👤 HUMANO EN CHATWOOT DICE:", text, "PARA:", phone);

        // Enviar mensaje al cliente vía WhatsApp
        await sendMessage(phone, { text: { body: text } });

        console.log("✅ Mensaje enviado correctamente a WhatsApp:", phone);

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
