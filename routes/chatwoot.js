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
        // 📂 LÓGICA DE ENVÍO MULTIMEDIA (Actualizada)
        // =====================================================

        if (attachments && attachments.length > 0) {
            const file = attachments[0];
            let type = "image"; // por defecto

            // Mapeo de tipos de Chatwoot a WhatsApp
            if (file.file_type === "file") type = "document";
            if (file.file_type === "audio") type = "audio";
            if (file.file_type === "video") type = "video";

            const payload = {
                type: type,
                [type]: {
                    link: file.data_url,
                    // Solo imágenes y documentos permiten 'caption'
                    caption: (type === "image" || type === "document") ? event.content : undefined,
                    // Si es documento, intentamos poner el nombre original
                    filename: type === "document" ? "Documento" : undefined
                },
                provenance: "chatwoot"
            };

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