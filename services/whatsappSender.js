import axios from "axios";
import 'dotenv/config';
import { sendBotMessageToChatwoot } from "./chatwootService.js";


const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!token || !phoneNumberId) {
  console.error("❌ ERROR: WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están definidos en el .env");
  process.exit(1); // termina el script para evitar enviar requests inválidos
}

export const sendMessage = async (to, payload) => {
  if (!to || !payload) return;

  try {
    const body = {
      messaging_product: "whatsapp",
      to,
    };

    let textToMirror = null;

    if (payload?.interactive) {
      body.type = "interactive";
      body.interactive = payload.interactive;
      textToMirror = payload.interactive.body?.text || "📋 Menú enviado";
    }
    else if (payload?.text) {
      body.type = "text";
      body.text = payload.text;
      textToMirror = payload.text.body;
    }
    else return;

    console.log("📤 Enviando a WhatsApp:", JSON.stringify(body, null, 2));

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

    console.log("✅ Mensaje enviado:", response.data);

    // 🔥 ESTO ES LO QUE FALTABA
    await sendBotMessageToChatwoot(to, textToMirror);

    return response.data;
  } catch (error) {
    console.error("❌ ERROR WHATSAPP:", error.response?.data || error.message);
  }
};
