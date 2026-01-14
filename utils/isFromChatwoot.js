export function isFromChatwoot(message) {
    const ctx = message.context;

    if (!ctx) return false;

    // Si el mensaje fue reenviado o tiene contexto de otro mensaje
    // significa que vino de Chatwoot
    if (ctx.forwarded === true) return true;
    if (ctx.from) return true;

    return false;
}
