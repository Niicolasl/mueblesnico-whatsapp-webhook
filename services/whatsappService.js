import axios from "axios";
import { menuPrincipal } from "../utils/messageTemplates.js";

export const handleMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";

    // MENÚ PRINCIPAL
    if (text === "menu" || text === "menú") {
      await sendMessage(from, menuPrincipal());
      return res.sendStatus(200);
    }
  } catch (error) {
    console.log("Error procesando mensaje:", error);
    res.sendStatus(500);
  }
};

async function sendMessage(to, body) {
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    data: body,
  });
}
