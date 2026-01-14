import axios from "axios";
import 'dotenv/config';

const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;

export async function sendBotMessageToChatwoot(phone, text) {
    if (!text || !phone) return;

    try {
        await axios.post(
            `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
            {
                source_id: phone,
                inbox_id: process.env.CHATWOOT_INBOX_ID,
                messages: [
                    {
                        content: text,
                        message_type: "outgoing",
                    },
                ],
            },
            {
                headers: {
                    api_access_token: CHATWOOT_TOKEN,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("💬 Bot → Chatwoot:", text);
    } catch (err) {
        console.error("❌ Chatwoot BOT sync error:", err?.response?.data || err.message);
    }
}
