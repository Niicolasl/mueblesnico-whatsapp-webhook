import axios from "axios";
import 'dotenv/config';
import { sendBotMessageToChatwoot } from "./chatwootService.js";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!token || !phoneNumberId) {
  console.error("❌ ERROR: WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están definidos en el .env");
  process.exit(1);
}

/**
 * Envia mensajes a WhatsApp y los refleja en Chatwoot
 */
export const sendMessage = async (to, payload) => {
  if (!to || !payload) return;

  try {
    const body = {
      messaging_product: "whatsapp",
      to,
    };

    let textToMirror = null;

    // 1. Manejo de mensajes interactivos (Listas/Botones)
    if (payload?.interactive) {
      body.type = "interactive";
      body.interactive = payload.interactive;

      // Extraemos el texto para que en Chatwoot se vea qué se envió
      const headerText = payload.interactive.header?.text ? `${payload.interactive.header.text}\n` : "";
      const bodyText = payload.interactive.body?.text || "";
      textToMirror = `${headerText}${bodyText}` || "📋 Menú interactivo enviado";
    }
    // 2. Manejo de mensajes de texto simple
    else if (payload?.text) {
      body.type = "text";
      body.text = payload.text;
      textToMirror = payload.text.body;
    }
    else {
      return;
    }

    console.log(`📤 Enviando a WhatsApp (${to}):`, textToMirror?.substring(0, 50) + "...");

    // 3. Petición a la API de WhatsApp
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 4. 🔥 Reflejar en Chatwoot como mensaje del BOT
    // Usamos un try/catch interno para que si falla Chatwoot no detenga la respuesta de WhatsApp
    if (textToMirror) {
      try {
        await sendBotMessageToChatwoot(to, textToMirror);
      } catch (cwError) {
        console.error("⚠️ Error al espejar en Chatwoot:", cwError.message);
      }
    }

    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    console.error("❌ ERROR WHATSAPP API:", JSON.stringify(errorData, null, 2) || error.message);
    return null;
  }
};