import axios from "axios";

export async function sendMessage(to, body) {
    await axios({
        method: "POST",
        url: `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
        },
        data: {
            to,
            ...body
        },
    });
}
