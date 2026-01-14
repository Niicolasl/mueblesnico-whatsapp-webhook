// routes/chatwoot.js
import express from "express";
import { sendMessage } from "../services/whatsappSender.js";
import { handleMessage } from "../services/whatsappService.js";
import { telefonoParaWhatsApp } from "../utils/phone.js";
import crypto from "crypto";

const router = express.Router();

// 🔹 Set en memoria para IDs procesados y hashes de mensajes recientes
const processedMessageIds = new Set();
const recentMessageHashes = new Set();

// 🔹 Tu número de WhatsApp (12 dígitos, 57 + número)
const MI_NUMERO_WPP = "573133931737"; // reemplaza con tu número real

// 🔹 Función para crear hash simple de {phone+text}
function hashMessage(phone, text) {
    return crypto.createHash("sha256").update(`${phone}:${text}`).digest("hex");
}

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log("💬 Webhook Chatwoot recibe:", JSON.stringify(event, null, 2));

        // Solo permitir mensajes de agentes humanos
        if (event.message_type !== "outgoing") {
            return res.sendStatus(200);
        }

        if (event.sender?.type !== "User") {
            console.log("⛔ Mensaje automático de Chatwoot ignorado");
            return res.sendStatus(200);
        }


        if (event.event !== "message_created") return res.sendStatus(200);
        if (!event.id) return res.sendStatus(200);

        // 🔹 Ignorar si ya procesamos este ID
        if (processedMessageIds.has(event.id)) {
            console.log("⚠️ Mensaje ya procesado, se ignora ID:", event.id);
            return res.sendStatus(200);
        }

        // Extraer número del contacto
        const phoneRaw =
            event.conversation?.contact_inbox?.source_id ||
            event.conversation?.meta?.sender?.identifier;

        if (!phoneRaw) {
            console.warn("⚠️ No se encontró número de contacto");
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        const phone = telefonoParaWhatsApp(phoneRaw);

        // Validación mínima
        if (!phone || phone.length !== 12 || !phone.startsWith("57")) {
            console.error("❌ Número inválido para WhatsApp:", phone);
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Ignorar mensajes de nuestro propio número
        if (phone === MI_NUMERO_WPP) {
            console.log("⚠️ Ignorado mensaje a nuestro propio número:", phone);
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Extraer texto
        const text = event.content?.trim() || "";
        if (!text) {
            console.warn("⚠️ Mensaje vacío");
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Crear hash {phone+text} para evitar loops
        const msgHash = hashMessage(phone, text);
        if (recentMessageHashes.has(msgHash)) {
            console.log("⚠️ Mensaje duplicado por hash, se ignora:", text);
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Mensajes de agentes → enviar a WhatsApp
        if (event.message_type === "outgoing") {
            console.log("👤 HUMANO EN CHATWOOT DICE:", text, "PARA:", phone);
            try {
                await sendMessage(phone, { text: { body: text } });
                console.log("✅ Mensaje enviado a WhatsApp:", phone);
            } catch (err) {
                console.error("❌ Error enviando a WhatsApp:", err.response?.data || err.message || err);
            }
        }

        // 🔹 Mensajes de clientes → procesar con bot
        if (event.message_type === "incoming") {
            console.log("🤖 CLIENTE CHATWOOT DICE:", text, "DESDE:", phone);
            try {
                await handleMessage({ text, from: phone });
            } catch (err) {
                console.error("❌ Error procesando mensaje de cliente:", err);
            }
        }

        // 🔹 Marcar como procesado
        processedMessageIds.add(event.id);
        recentMessageHashes.add(msgHash);

        // 🔹 Limpiar sets para no crecer indefinidamente
        if (processedMessageIds.size > 1000) {
            const firstId = processedMessageIds.values().next().value;
            processedMessageIds.delete(firstId);
        }
        if (recentMessageHashes.size > 1000) {
            const firstHash = recentMessageHashes.values().next().value;
            recentMessageHashes.delete(firstHash);
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
