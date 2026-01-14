// routes/chatwoot.js
import express from "express";
import { sendMessage } from "../services/whatsappSender.js";
import { telefonoParaWhatsApp } from "../utils/phone.js";

const router = express.Router();

// 🔹 Set en memoria para IDs procesados y evitar duplicados
const processedMessageIds = new Set();

// 🔹 Tu número de WhatsApp (12 dígitos, 57 + número)
const MI_NUMERO_WPP = "573133931737"; // reemplaza con tu número real

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 🔹 Log completo para depuración
        console.log("💬 Webhook Chatwoot recibe:", JSON.stringify(event, null, 2));

        // Solo procesamos eventos de mensajes creados
        if (event.event !== "message_created") return res.sendStatus(200);

        const messageId = event.id;
        if (!messageId) return res.sendStatus(200);

        // 🔹 Ignorar si ya procesamos este mensaje
        if (processedMessageIds.has(messageId)) {
            console.log("⚠️ Mensaje ya procesado, se ignora:", messageId);
            return res.sendStatus(200);
        }

        // Solo queremos mensajes "outgoing" (enviados por agentes humanos)
        if (event.message_type !== "outgoing") return res.sendStatus(200);

        // Extraer texto
        const text = event.content?.trim();
        if (!text) {
            console.warn("⚠️ Mensaje vacío de Chatwoot");
            return res.sendStatus(200);
        }

        // Extraer número del contacto
        const phoneRaw =
            event.conversation?.contact_inbox?.source_id || // normalmente aquí
            event.conversation?.meta?.sender?.identifier;  // fallback

        if (!phoneRaw) {
            console.warn("⚠️ No se encontró número de contacto");
            return res.sendStatus(200);
        }

        const phone = telefonoParaWhatsApp(phoneRaw);
        if (!phone || phone.length !== 12 || !phone.startsWith("57")) {
            console.error("❌ Número inválido para WhatsApp:", phone);
            return res.sendStatus(200);
        }

        // 🔹 Ignorar mensajes que son de nuestro propio número de WhatsApp
        if (phone === MI_NUMERO_WPP) {
            console.log("⚠️ Ignorado mensaje a nuestro propio número:", phone);
            return res.sendStatus(200);
        }

        console.log("👤 HUMANO EN CHATWOOT DICE:", text, "PARA:", phone);

        try {
            await sendMessage(phone, { text: { body: text } });
            console.log("✅ Mensaje enviado correctamente a WhatsApp:", phone);

            // 🔹 Marcar como procesado
            processedMessageIds.add(messageId);

            // 🔹 Limpiar IDs antiguos para no crecer indefinidamente (opcional)
            if (processedMessageIds.size > 1000) {
                const first = processedMessageIds.values().next().value;
                processedMessageIds.delete(first);
            }
        } catch (err) {
            console.error("❌ Error enviando a WhatsApp:", err.response?.data || err.message || err);
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
