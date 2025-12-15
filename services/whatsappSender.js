import axios from "axios";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

export const sendMessage = async (to, payload) => {
  try {
    const finalPayload = {
      messaging_product: "whatsapp",
      to,
      ...(payload.type
        ? payload
        : {
            type: "text",
            text: payload.text
          })
    };

    console.log("📤 WHATSAPP PAYLOAD:", JSON.stringify(finalPayload, null, 2));

    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      finalPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "❌ Error enviando mensaje:",
      error.response?.data || error
    );
  }
};
