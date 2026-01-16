import express from "express";
import { sendMessage } from "../services/whatsappSender.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const event = req.body;

        // 1. Solo procesamos mensajes creados que sean salientes (agente -> cliente)
        if (event.event !== "message_created" || event.message_type !== "outgoing") {
            return res.sendStatus(200);
        }

        // 2. 🛑 CORTE DEFINITIVO DE BUCLE:
        // Chatwoot marca los mensajes de los agentes como 'user'. 
        // Si el mensaje lo envió el sistema, el bot o una automatización, NO es tipo 'user'.
        const esAgenteHumano = event.sender?.type === "user";
        const esNotaPrivada = event.private === true;

        if (!esAgenteHumano || esNotaPrivada) {
            // Si no lo escribió un humano manualmente en el chat, lo ignoramos para no repetir lo que el bot ya dijo.
            return res.sendStatus(200);
        }

        // 3. Extraer datos para el envío
        const text = event.content?.trim();
        const sourceId = event.conversation?.contact_inbox?.source_id;

        // Si no hay texto o no hay número de destino, salimos.
        if (!text || !sourceId) {
            return res.sendStatus(200);
        }

        // 4. Evitar enviar de nuevo si el contenido es exactamente un comando de menú (opcional)
        const esComandoBot = ["menu", "menú", "cotizar"].includes(text.toLowerCase());
        if (esComandoBot) {
            return res.sendStatus(200);
        }

        console.log("👤 Agente Humano detectado -> Enviando a WhatsApp:", sourceId);

        // Enviamos el mensaje del agente humano a WhatsApp
        await sendMessage(sourceId, { text: { body: text } });

        return res.sendStatus(200);
    } catch (err) {
        console.error("❌ Chatwoot webhook error:", err.message);
        return res.sendStatus(200); // Siempre respondemos 200 a Chatwoot para evitar reintentos fallidos
    }
});

export default router;