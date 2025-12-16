import axios from "axios";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

export const sendMessage = async (to, payload) => {
  try {
    let body = {
      messaging_product: "whatsapp",
      to,
    };

    // ✅ SI ES INTERACTIVE
    if (payload?.interactive) {
      body.type = "interactive";
      body.interactive = payload.interactive;
    }

    // ✅ SI ES TEXTO
    else if (payload?.text) {
      body.type = "text";
      body.text = payload.text;
    }

    // 🚨 SI NO ES NADA → ERROR CLARO
    else {
      console.error("❌ PAYLOAD INVÁLIDO:", payload);
      return;
    }

    console.log("📤 PAYLOAD ENVIADO A WHATSAPP:", JSON.stringify(body, null, 2));

    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "❌ ERROR WHATSAPP:",
      error.response?.data || error.message
    );
  }
};
