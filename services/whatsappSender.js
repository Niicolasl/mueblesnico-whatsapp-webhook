import axios from "axios";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID; // ID del número, NO el número mismo

/**
 * Envía un mensaje a WhatsApp Cloud API
 * @param {string} to Número destino en formato E.164 (ej: 573204128555)
 * @param {object} payload { text: { body: "mensaje" } } o { interactive: {...} }
 */
export const sendMessage = async (to, payload) => {
  try {
    if (!to || !payload) {
      console.error("❌ sendMessage requiere 'to' y 'payload'");
      return;
    }

    const body = {
      messaging_product: "whatsapp",
      to,
    };

    if (payload?.interactive) {
      body.type = "interactive";
      body.interactive = payload.interactive;
    } else if (payload?.text) {
      body.type = "text";
      body.text = payload.text;
    } else {
      console.error("❌ PAYLOAD INVÁLIDO:", payload);
      return;
    }

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
    return response.data;
  } catch (error) {
    // 🛡️ Manejo completo de error
    if (error.response) {
      console.error("❌ ERROR WHATSAPP:", error.response.status, error.response.data);
    } else {
      console.error("❌ ERROR WHATSAPP:", error.message);
    }
  }
};
