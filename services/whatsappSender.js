import axios from "axios";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

export const sendMessage = async (to, payload) => {
  try {
    console.log("📤 PAYLOAD ENVIADO A WHATSAPP:", JSON.stringify({
      messaging_product: "whatsapp",
      to,
      ...payload
    }, null, 2));

    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        ...payload,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ ERROR WHATSAPP:", error.response?.data || error);
  }
};
