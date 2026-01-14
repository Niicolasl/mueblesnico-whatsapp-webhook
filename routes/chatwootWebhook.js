// routes/chatwoot.js
import express from "express";
import { sendMessage } from "../services/whatsappSender.js";
import { telefonoParaWhatsApp } from "../utils/phone.js";
import { handleMessage } from "../services/whatsappService.js"; // función que maneja flujos de cliente

const router = express.Router();

// 🔹 Set en memoria para IDs procesados y evitar duplicados
const processedMessageIds = new Set();

// 🔹 Tu número de WhatsApp (12 dígitos, 57 + número)
const MI_NUMERO_WPP = "573133931737"; // reemplaza con tu número real

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log("💬 Webhook Chatwoot recibe:", JSON.stringify(event, null, 2));

        // 🔹 Solo procesamos eventos de mensaje creado
        if (event.event !== "message_created") return res.sendStatus(200);

        const messageId = event.id;
        if (!messageId) return res.sendStatus(200);

        // 🔹 Ignorar si ya procesamos este mensaje
        if (processedMessageIds.has(messageId)) {
            console.log("⚠️ Mensaje ya procesado, se ignora:", messageId);
            return res.sendStatus(200);
        }

        // 🔹 Extraer texto
        const text = event.content?.trim();
        if (!text) return res.sendStatus(200);

        // 🔹 Extraer número del contacto
        const phoneRaw =
            event.conversation?.contact_inbox?.source_id || // normalmente aquí
            event.conversation?.meta?.sender?.identifier;  // fallback

        if (!phoneRaw) return res.sendStatus(200);

        const phone = telefonoParaWhatsApp(phoneRaw);
        if (!phone || phone.length !== 12 || !phone.startsWith("57")) return res.sendStatus(200);

        // 🔹 Ignorar mensajes que provienen de nuestro propio número
        if (phone === MI_NUMERO_WPP) {
            console.log("⚠️ Ignorado mensaje de nuestro propio número:", phone);
            return res.sendStatus(200);
        }

        // 🔹 Diferenciar mensajes entrantes de clientes vs salientes de agentes
        if (event.message_type === "outgoing") {
            // Mensajes enviados por agentes humanos desde Chatwoot → reenviar a WhatsApp
            console.log("👤 HUMANO EN CHATWOOT DICE:", text, "PARA:", phone);
            try {
                await sendMessage(phone, { text: { body: text } });
                console.log("✅ Mensaje enviado correctamente a WhatsApp:", phone);
            } catch (err) {
                console.error("❌ Error enviando a WhatsApp:", err.response?.data || err.message || err);
            }
        } else if (event.message_type === "incoming") {
            // Mensajes entrantes de clientes → procesar flujos
            console.log("🤖 CLIENTE CHATWOOT DICE:", text, "DESDE:", phone);
            try {
                await handleMessage({ text, from: phone });
            } catch (err) {
                console.error("❌ Error procesando mensaje de cliente:", err);
            }
        }

        // 🔹 Marcar mensaje como procesado para evitar duplicados
        processedMessageIds.add(messageId);
        if (processedMessageIds.size > 1000) {
            const first = processedMessageIds.values().next().value;
            processedMessageIds.delete(first);
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
