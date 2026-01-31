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
        // 🔥 DEBUG TEMPORAL - COPIAR ESTO
        if (attachments && attachments.length > 0) {
            console.log("=".repeat(60));
            console.log("📎 DEBUG ATTACHMENT COMPLETO:");
            console.log(JSON.stringify(event, null, 2));
            console.log("=".repeat(60));
        }


        if (!sourceId) return res.sendStatus(200);

        // 4. Bloqueo de comandos manuales
        if (text) {
            const lowerText = text.toLowerCase();
            if (["menu", "menú", "cotizar", "saldo", "pedido"].includes(lowerText)) {
                return res.sendStatus(200);
            }
        }

        // =====================================================
        // 📂 LÓGICA DE ENVÍO MULTIMEDIA (CON FILENAME CORRECTO)
        // =====================================================

        if (attachments && attachments.length > 0) {
            const file = attachments[0];
            let type = "image"; // por defecto

            // Mapeo de tipos de Chatwoot a WhatsApp
            if (file.file_type === "file") type = "document";
            if (file.file_type === "audio") type = "audio";
            if (file.file_type === "video") type = "video";

            // 🔥 EXTRAER NOMBRE DEL ARCHIVO DESDE LA URL
            let filename = "archivo"; // fallback

            if (type === "document") {
                // Opción 1: Chatwoot envía el nombre en data_url
                // Ejemplo: https://chatwoot.com/rails/active_storage/.../Cotizacion.pdf
                try {
                    const urlParts = file.data_url.split('/');
                    const lastPart = urlParts[urlParts.length - 1];

                    // Decodificar por si tiene caracteres especiales (%20, etc.)
                    const decodedName = decodeURIComponent(lastPart);

                    // Remover query params si existen (ej: ?token=xxx)
                    const cleanName = decodedName.split('?')[0];

                    // Si tiene extensión válida, usar ese nombre
                    if (/\.(pdf|docx?|xlsx?|txt|csv|zip|rar)$/i.test(cleanName)) {
                        filename = cleanName;
                    } else {
                        // Si no tiene extensión, intentar extraerla del mime_type o data_url
                        const extension = file.data_url.match(/\.(pdf|docx?|xlsx?|txt|csv|zip|rar)/i)?.[0] || '.pdf';
                        filename = `documento${extension}`;
                    }
                } catch (err) {
                    console.log("⚠️ No se pudo extraer nombre del archivo, usando genérico");
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
            }

            console.log(`📤 Enviando ${type} con filename: ${filename}`);

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