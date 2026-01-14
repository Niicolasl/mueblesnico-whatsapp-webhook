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

        // 🔹 CORRECCIÓN: Extraer número del contacto
        const phoneRaw =
            event.conversation?.contact_inbox?.source_id || // viene directo aquí
            event.conversation?.meta?.sender?.identifier;   // fallback

        if (!phoneRaw) {
            console.warn("⚠️ No se encontró número de contacto en el evento");
            return res.sendStatus(200);
        }

        // Normalizar número para WhatsApp
        const phone = telefonoParaWhatsApp(phoneRaw);

        console.log("👤 HUMANO EN CHATWOOT DICE:", text, "PARA:", phone);

        // Validación mínima para evitar 404
        if (!phone || phone.length !== 12 || !phone.startsWith("57")) {
            console.error("❌ Número inválido para WhatsApp Cloud API:", phone);
            return res.sendStatus(200);
        }

        try {
            // Enviar mensaje al cliente vía WhatsApp
            await sendMessage(phone, { text: { body: text } });
            console.log("✅ Mensaje enviado correctamente a WhatsApp:", phone);
        } catch (err) {
            // Capturamos errores de WhatsApp (404, 401, etc)
            console.error("❌ Chatwoot CLIENTE:", err.response?.data || err.message || err);
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
