import axios from "axios";
import 'dotenv/config';
import { sendBotMessageToChatwoot } from "./chatwootService.js";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!token || !phoneNumberId) {
  console.error("❌ ERROR: WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están definidos en el .env");
  process.exit(1);
}

export const sendMessage = async (to, payload) => {
  if (!to || !payload) return;

  try {
    const body = {
      messaging_product: "whatsapp",
      to,
    };

    let textToMirror = null;
    const type = payload.type;

    // --- 1. IMÁGENES, DOCUMENTOS Y VIDEOS ---
    if (["image", "document", "video"].includes(type)) {
      body.type = type;
      body[type] = {
        link: payload[type].link,
        caption: payload[type].caption || ""
      };

      // 🔥 AGREGAR FILENAME PARA DOCUMENTOS
      if (type === "document" && payload[type].filename) {
        body[type].filename = payload[type].filename;
        console.log(`📎 Agregando filename al payload de WhatsApp: "${payload[type].filename}"`);
      }

      const iconos = { image: "📷", document: "📄", video: "🎥" };
      textToMirror = `${iconos[type]} Archivo enviado: ${payload[type].caption || type}`;
    }

    // --- 2. AUDIOS (No soportan caption) ---
    else if (type === "audio") {
      body.type = "audio";
      body.audio = { link: payload.audio.link };
      textToMirror = "🎵 Audio enviado";
    }

    // --- 3. MENSAJES INTERACTIVOS (Botones/Listas) ---
    else if (type === "interactive") {
      body.type = "interactive";
      body.interactive = payload.interactive;
      const bodyText = payload.interactive.body?.text || "";
      textToMirror = `📋 Menú enviado: ${bodyText}`;
    }

    // --- 4. PLANTILLAS (TEMPLATES) ---
    else if (type === "template") {
      body.type = "template";
      body.template = payload.template;
      textToMirror = `📋 Plantilla enviada: ${payload.template.name}`;
      console.log(`📤 Enviando plantilla "${payload.template.name}" a ${to}`);
    }

    // --- 5. TEXTO SIMPLE ---
    else if (type === "text" || payload.text) {
      body.type = "text";
      body.text = payload.text?.body ? payload.text : { body: payload.text };
      textToMirror = body.text.body;
    }

    else {
      console.error("⚠️ Tipo de mensaje no soportado:", payload);
      return;
    }

    // 🚀 Petición a WhatsApp
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      body,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    console.log(`✅ Mensaje enviado exitosamente a ${to}`);

    // 🔄 Espejo en Chatwoot (Solo si no viene de Chatwoot)
    if (textToMirror && payload.provenance !== "chatwoot") {
      try {
        await sendBotMessageToChatwoot(to, textToMirror);
      } catch (cwError) {
        console.error("⚠️ Error al espejar en Chatwoot:", cwError.message);
      }
    }

    return response.data;
  } catch (error) {
    console.error("❌ ERROR WHATSAPP API:", JSON.stringify(error.response?.data, null, 2) || error.message);
    return null;
  }
};