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

        // 2. 🔥 FILTRO ANTI-ECO: Si el ID está en la memoria del Bot, ignorar.
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
        const attachments = event.attachments;

        if (!sourceId) return res.sendStatus(200);

        // 4. Bloqueo de comandos manuales del agente
        if (text) {
            const lowerText = text.toLowerCase();
            if (["menu", "menú", "cotizar", "saldo", "pedido"].includes(lowerText)) {
                console.log("🚫 Comando bloqueado: El agente no puede disparar flujos del bot.");
                return res.sendStatus(200);
            }
        }

        // =====================================================
        // 🖼️ LÓGICA DE ENVÍO MULTIMEDIA O TEXTO
        // =====================================================

        // A. PRIORIDAD: Si hay archivos adjuntos
        if (attachments && attachments.length > 0) {
            const file = attachments[0];
            if (file.file_type === "image") {
                await sendMessage(sourceId, {
                    type: "image",
                    image: {
                        link: file.data_url,
                        caption: event.content // 👈 Aquí pasamos el texto que escribiste en Chatwoot
                    }
                });
                return res.sendStatus(200);
            }
        }

        // B. SECUNDARIO: Si no hay adjuntos, enviar como texto simple
        if (text) {
            console.log("👤 Agente Humano -> WhatsApp:", sourceId);

            await sendMessage(sourceId, {
                text: { body: text },
                provenance: "chatwoot" // 👈 Marcamos que viene de Chatwoot
            });
        }

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        // Respondemos 200 para que Chatwoot no reintente infinitamente en caso de error transitorio
        return res.sendStatus(200);
    }
});

export default router;