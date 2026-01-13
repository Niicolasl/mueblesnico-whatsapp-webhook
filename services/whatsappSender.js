import axios from "axios";
import 'dotenv/config';

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!token || !phoneNumberId) {
  console.error("❌ ERROR: WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están definidos en el .env");
  process.exit(1); // termina el script para evitar enviar requests inválidos
}

export const sendMessage = async (to, payload) => {
  if (!to) {
    console.error("❌ ERROR: Número de destino no proporcionado");
    return;
  }

  if (!payload) {
    console.error("❌ ERROR: Payload no proporcionado");
    return;
  }

  try {
    const body = {
      messaging_product: "whatsapp",
      to,
    };

    // ✅ Mensaje interactivo
    if (payload?.interactive) {
      body.type = "interactive";
      body.interactive = payload.interactive;
    }
    // ✅ Mensaje de texto
    else if (payload?.text) {
      body.type = "text";
      body.text = payload.text;
    }
    else {
      console.error("❌ ERROR: Payload inválido", payload);
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

    console.log("✅ Mensaje enviado correctamente:", response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(
        "❌ ERROR WHATSAPP:",
        error.response.status,
        error.response.data
      );
      if (error.response.status === 401) {
        console.error("⚠️ TOKEN INVÁLIDO: Revisa que WHATSAPP_TOKEN sea correcto y esté activo");
      }
      if (error.response.status === 404) {
        console.error("⚠️ PHONE_NUMBER_ID incorrecto o endpoint mal configurado");
      }
    } else {
      console.error("❌ ERROR WHATSAPP:", error.message);
    }
  }
};
