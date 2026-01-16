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
 * Envía mensajes a WhatsApp y los refleja en Chatwoot
 */
export const sendMessage = async (to, payload) => {
  if (!to || !payload) return;

  try {
    const body = {
      messaging_product: "whatsapp",
      to,
    };

    let textToMirror = null;

    // --- 1. MANEJO DE IMÁGENES ---
    if (payload.type === "image" || payload.image) {
      body.type = "image";
      body.image = {
        link: payload.image?.link || payload.link
      };
      textToMirror = "📷 Imagen enviada";
    }

    // --- 2. MANEJO DE MENSAJES INTERACTIVOS (Listas/Botones) ---
    else if (payload?.type === "interactive" || payload?.interactive) {
      body.type = "interactive";
      body.interactive = payload.interactive;

      // Extraemos texto para Chatwoot
      const headerText = payload.interactive.header?.text ? `${payload.interactive.header.text}\n` : "";
      const bodyText = payload.interactive.body?.text || "";
      textToMirror = `${headerText}${bodyText}` || "📋 Menú interactivo enviado";
    }

    // --- 3. MANEJO DE TEXTO SIMPLE ---
    else if (payload?.type === "text" || payload?.text) {
      body.type = "text";
      // Si el payload es un objeto con body o solo el objeto text
      body.text = payload.text?.body ? payload.text : { body: payload.text };
      textToMirror = body.text.body;
    }

    else {
      console.error("⚠️ Tipo de mensaje no soportado:", payload);
      return;
    }

    console.log(`📤 Enviando a WhatsApp (${to}):`, textToMirror?.substring(0, 50) + "...");

    // 🚀 Petición a la API de WhatsApp
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

    // 🔄 Reflejar en Chatwoot (siempre que no sea un eco)
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