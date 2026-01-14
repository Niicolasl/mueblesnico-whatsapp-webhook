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
const MI_NUMERO_WPP = "573133931737";

// 🔹 Crear hash simple de {phone+text}
function hashMessage(phone, text) {
    return crypto.createHash("sha256").update(`${phone}:${text}`).digest("hex");
}

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 🔎 Log corto y útil
        console.log(
            "💬 Chatwoot:",
            event.message_type,
            "|",
            event.sender?.type,
            "|",
            event.content,
            "|",
            event.conversation?.meta?.sender?.identifier
        );

        if (event.event !== "message_created") return res.sendStatus(200);
        if (!event.id) return res.sendStatus(200);

        // 🔹 Evitar reprocesar el mismo evento
        if (processedMessageIds.has(event.id)) {
            console.log("⚠️ ID duplicado ignorado:", event.id);
            return res.sendStatus(200);
        }

        // Solo permitir mensajes de agentes humanos o clientes
        if (!["incoming", "outgoing"].includes(event.message_type)) {
            return res.sendStatus(200);
        }

        // 🔹 Ignorar mensajes del BOT (API de Chatwoot)
        if (event.sender?.type === "Api::V1::MessagesController") {
            console.log("🤖 Mensaje del bot ignorado");
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }


        // 🔹 Obtener número del contacto
        const phoneRaw =
            event.conversation?.contact_inbox?.source_id ||
            event.conversation?.meta?.sender?.identifier;

        if (!phoneRaw) {
            console.warn("⚠️ Sin número de contacto");
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        const phone = telefonoParaWhatsApp(phoneRaw);

        if (!phone || phone.length !== 12 || !phone.startsWith("57")) {
            console.error("❌ Número inválido:", phoneRaw, "→", phone);
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Ignorar mensajes a nuestro propio número
        if (phone === MI_NUMERO_WPP) {
            console.log("⚠️ Mensaje a nuestro propio número ignorado");
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Texto
        const text = event.content?.trim();
        if (!text) {
            console.warn("⚠️ Mensaje vacío");
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // 🔹 Anti-loop por hash {phone+text}
        const msgHash = hashMessage(phone, text);
        if (recentMessageHashes.has(msgHash)) {
            console.log("🔁 Hash duplicado ignorado:", text);
            processedMessageIds.add(event.id);
            return res.sendStatus(200);
        }

        // ===============================
        // 🧭 RUTEO PRINCIPAL
        // ===============================

        // 👤 Agente humano → WhatsApp
        // 👤 Agente humano → WhatsApp
        if (event.message_type === "outgoing" && event.sender?.type === "User") {
            console.log("👤 Agente → WhatsApp:", phone, ":", text);
            try {
                await sendMessage(phone, { text: { body: text } });
                console.log("✅ Enviado a WhatsApp");
            } catch (err) {
                console.error("❌ Error enviando a WhatsApp:", err.response?.data || err.message);
            }
        }

        // 🤖 Cliente → Bot
        if (event.message_type === "incoming") {
            console.log("🤖 Cliente → Bot:", phone, ":", text);
            try {
                await handleMessage({ text, from: phone });
            } catch (err) {
                console.error("❌ Error en bot:", err);
            }
        }

        // 🔹 Marcar como procesado
        processedMessageIds.add(event.id);
        recentMessageHashes.add(msgHash);

        // 🔹 Limpieza
        if (processedMessageIds.size > 1000) {
            processedMessageIds.delete(processedMessageIds.values().next().value);
        }
        if (recentMessageHashes.size > 1000) {
            recentMessageHashes.delete(recentMessageHashes.values().next().value);
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Error Chatwoot webhook:", err);
        return res.sendStatus(500);
    }
});

export default router;
