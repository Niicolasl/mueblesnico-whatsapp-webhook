import express from "express";
import { sendMessage } from "../services/whatsappSender.js";
import { lastSentMessages } from "../services/chatwootService.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 1. Ignorar si no es un mensaje saliente
        if (event.event !== "message_created" || event.message_type !== "outgoing") {
            return res.sendStatus(200);
        }

        // 2. 🔥 FILTRO ANTI-ECO
        if (lastSentMessages.has(event.id)) {
            return res.sendStatus(200);
        }

        // 3. Solo AGENTE HUMANO
        const esAgenteHumano = event.sender?.type === "user";
        if (!esAgenteHumano || event.private === true) {
            return res.sendStatus(200);
        }

        const sourceId = event.conversation?.contact_inbox?.source_id || event.conversation?.meta?.sender?.phone_number;
        const text = event.content?.trim();
        const attachments = event.attachments;
        
        if (!sourceId) return res.sendStatus(200);

        // 4. Bloqueo de comandos manuales
        if (text) {
            const lowerText = text.toLowerCase();
            if (["menu", "menú", "cotizar", "saldo", "pedido"].includes(lowerText)) {
                return res.sendStatus(200);
            }
        }

        // =====================================================
        // 📂 LÓGICA DE ENVÍO MULTIMEDIA (FILENAME CORRECTO)
        // =====================================================

        if (attachments && attachments.length > 0) {
            const file = attachments[0];
            let type = "image"; // por defecto

            // Mapeo de tipos de Chatwoot a WhatsApp
            if (file.file_type === "file") type = "document";
            if (file.file_type === "audio") type = "audio";
            if (file.file_type === "video") type = "video";

            // 🔥 EXTRAER NOMBRE DEL ARCHIVO DESDE LA URL
            let filename = "documento.pdf"; // fallback

            if (type === "document" && file.data_url) {
                try {
                    // La URL de Chatwoot viene así:
                    // https://chatwoot.../rails/active_storage/blobs/redirect/TOKEN/Prueba_Debug.pdf

                    // Obtener la última parte de la URL (después de la última /)
                    const urlParts = file.data_url.split('/');
                    const lastPart = urlParts[urlParts.length - 1];

                    console.log(`🔍 Última parte de URL: ${lastPart}`);

                    // Decodificar caracteres especiales (%20 → espacio, etc.)
                    const decoded = decodeURIComponent(lastPart);

                    // Verificar si tiene una extensión válida de documento
                    const hasValidExtension = /\.(pdf|docx?|xlsx?|txt|csv|zip|rar|pptx?|png|jpe?g|gif)$/i.test(decoded);

                    if (hasValidExtension) {
                        filename = decoded;
                        console.log(`✅ Nombre extraído: ${filename}`);
                    } else {
                        console.log(`⚠️ No se encontró extensión válida, usando genérico`);
                        // Intentar obtener extensión del mime_type si existe
                        filename = "documento.pdf";
                    }
                } catch (err) {
                    console.error("⚠️ Error extrayendo filename:", err.message);
                    filename = "documento.pdf";
                }
            }

            const payload = {
                type: type,
                [type]: {
                    link: file.data_url
                },
                provenance: "chatwoot"
            };

            // Solo agregar caption si el tipo lo permite (imagen o documento)
            if ((type === "image" || type === "document") && event.content) {
                payload[type].caption = event.content;
            }

            // 🔥 AGREGAR FILENAME SOLO PARA DOCUMENTOS
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
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(200);
    }
});

export default router;