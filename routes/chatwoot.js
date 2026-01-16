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

        // 2. 🔥 FILTRO ANTI-ECO: Si el ID está en lastSentMessages, es el bot quien lo envió
        if (lastSentMessages.has(event.id)) {
            console.log("⏭️ Eco del Bot detectado (ID conocido). Ignorando...");
            return res.sendStatus(200);
        }

        // 3. Solo procesar si lo escribió un AGENTE HUMANO (tipo 'user')
        const esAgenteHumano = event.sender?.type === "user";
        if (!esAgenteHumano || event.private === true) {
            return res.sendStatus(200);
        }

        const sourceId = event.conversation?.contact_inbox?.source_id;
        const text = event.content?.trim();
        const attachments = event.attachments; // 👈 Detectar archivos adjuntos

        if (!sourceId) return res.sendStatus(200);

        // 4. Bloqueo de comandos manuales del agente (solo si es texto)
        if (text) {
            const lowerText = text.toLowerCase();
            if (["menu", "menú", "cotizar"].includes(lowerText)) {
                return res.sendStatus(200);
            }
        }

        // =====================================================
        // 🖼️ LÓGICA DE ENVÍO (IMAGEN O TEXTO)
        // =====================================================

        // A. Si hay adjuntos (prioridad a la imagen)
        if (attachments && attachments.length > 0) {
            const file = attachments[0];

            if (file.file_type === "image") {
                console.log("📸 Agente Humano -> Enviando Imagen a WhatsApp");
                await sendMessage(sourceId, {
                    type: "image",
                    image: {
                        link: file.data_url,
                        caption: text || "" // Si escribiste texto junto a la imagen, se envía como pie de foto
                    }
                });
                return res.sendStatus(200);
            }
        }

        // B. Si es solo texto
        if (text) {
            console.log("👤 Agente Humano -> WhatsApp:", sourceId);
            await sendMessage(sourceId, { text: { body: text } });
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(200);
    }
});

export default router;