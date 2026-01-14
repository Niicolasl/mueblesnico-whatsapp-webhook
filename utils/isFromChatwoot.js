const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export function isFromChatwoot(message) {
    // Mensajes enviados por el propio número del bot
    return message.from === PHONE_NUMBER_ID;
}
