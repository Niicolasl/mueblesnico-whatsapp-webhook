export const menuPrincipal = () => ({
  messaging_product: "whatsapp",
  type: "interactive",
  interactive: {
    type: "button",
    body: {
      text: "👋 *¡Bienvenido al menú de Muebles Nico!*\n\nSelecciona una opción:"
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "COTIZAR", title: "📝 Cotizar" } },
        { type: "reply", reply: { id: "SALDO", title: "💰 Consultar / Abonar saldo" } },
        { type: "reply", reply: { id: "GARANTIA", title: "🛠 Garantía" } },
        { type: "reply", reply: { id: "TIEMPOS", title: "⏳ Tiempos de entrega" } },
        { type: "reply", reply: { id: "PEDIDO", title: "📦 Preguntar por mi pedido" } }
      ]
    }
  }
});
