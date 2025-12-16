import axios from "axios";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

export const sendMessage = async (to, payload) => {
  try {
    const body = {
      messaging_product: "whatsapp",
      to,
    };

    if (payload.type === "interactive") {
      body.type = "interactive";
      body.interactive = payload.interactive;
    } else {
      body.type = "text";
      body.text = payload.text;
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
