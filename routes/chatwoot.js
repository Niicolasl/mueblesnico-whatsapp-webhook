import express from "express";
import { sendMessage } from "../services/whatsappSender.js";
import { lastSentMessages } from "../services/chatwootService.js";

const router = express.Router();

// 🔥 Lista de eventos que NO deben disparar ninguna acción
const EVENTOS_IGNORADOS = [
    "conversation_updated",
    "conversation_status_changed",
    "contact_updated",
    "message_updated"
];

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        console.log(`📥 Webhook Chatwoot: evento="${event.event}", tipo="${event.message_type}"`);

        // 🔥 PASO 1: Ignorar eventos de actualización
        if (EVENTOS_IGNORADOS.includes(event.event)) {
            console.log(`⏭️ Evento ignorado: ${event.event}`);
            return res.sendStatus(200);
        }

        // 🔥 PASO 2: Solo procesar mensajes salientes creados
        if (event.event !== "message_created" || event.message_type !== "outgoing") {
            return res.sendStatus(200);
        }

        // 🔥 PASO 3: Filtro anti-eco
        if (lastSentMessages.has(event.id)) {
            console.log(`🔄 Mensaje ya enviado (anti-eco): ${event.id}`);
            return res.sendStatus(200);
        }

        // 🔥 PASO 4: Solo agente humano
        const esAgenteHumano = event.sender?.type === "user";
        if (!esAgenteHumano || event.private === true) {
            console.log(`🤖 Mensaje de bot o privado, ignorando`);
            return res.sendStatus(200);
        }

        const sourceId = event.conversation?.contact_inbox?.source_id || event.conversation?.meta?.sender?.phone_number;
        const text = event.content?.trim();
        const attachments = event.attachments;

        if (!sourceId) {
            console.log(`⚠️ No se encontró sourceId`);
            return res.sendStatus(200);
        }

        // 🔥 PASO 5: Bloqueo de comandos manuales
        if (text) {
            const lowerText = text.toLowerCase();
            if (["menu", "menú", "cotizar", "saldo", "pedido"].includes(lowerText)) {
                console.log(`🚫 Comando bloqueado: ${lowerText}`);
                return res.sendStatus(200);
            }
        }

        console.log(`✅ Procesando mensaje de agente humano`);

        // =====================================================
        // 📂 LÓGICA DE ENVÍO MULTIMEDIA
        // =====================================================

        if (attachments && attachments.length > 0) {
            const file = attachments[0];
            let type = "image";

            if (file.file_type === "file") type = "document";
            if (file.file_type === "audio") type = "audio";
            if (file.file_type === "video") type = "video";

            let filename = "documento.pdf";

            if (type === "document" && file.data_url) {
                try {
                    const urlParts = file.data_url.split('/');
                    const lastPart = urlParts[urlParts.length - 1];
                    const decoded = decodeURIComponent(lastPart);
                    const hasValidExtension = /\.(pdf|docx?|xlsx?|txt|csv|zip|rar|pptx?|png|jpe?g|gif)$/i.test(decoded);

                    if (hasValidExtension) {
                        filename = decoded;
                        console.log(`✅ Nombre extraído: ${filename}`);
                    }
                } catch (err) {
                    console.error("⚠️ Error extrayendo filename:", err.message);
                }
            }

            const payload = {
                type: type,
                [type]: {
                    link: file.data_url
                },
                provenance: "chatwoot"
            };

            if ((type === "image" || type === "document") && event.content) {
                payload[type].caption = event.content;
            }

            if (type === "document") {
                payload[type].filename = filename;
                console.log(`📤 Enviando documento con filename: "${filename}"`);
            }

            await sendMessage(sourceId, payload);
            return res.sendStatus(200);
        }

        // =====================================================
        // 💬 LÓGICA DE TEXTO SIMPLE
        // =====================================================
        if (text) {
            await sendMessage(sourceId, {
                text: { body: text },
                provenance: "chatwoot"
            });
            console.log(`📤 Texto enviado: "${text.substring(0, 30)}..."`);
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(200);
    }
});

export default router;
