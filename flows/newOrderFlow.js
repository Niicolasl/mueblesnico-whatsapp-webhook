import { createOrder } from "../db/orders.js";
import { sendMessage } from "../services/whatsappSender.js";

// Aquí se guardan estados temporales de los admins
export const newOrderState = {};

/*
  Flujo paso a paso:
  Paso 1 → nombre
  Paso 2 → número
  Paso 3 → descripción
  Paso 4 → valor total
*/

export async function startNewOrderFlow(admin) {
    newOrderState[admin] = {
        step: 1,
        data: {}
    };

    await sendMessage(admin, {
        messaging_product: "whatsapp",
        text: { body: "✏️ *Nuevo Pedido*\n\nEscribe el *nombre del cliente*:" }
    });
}

export async function handleNewOrderStep(admin, message) {
    const state = newOrderState[admin];
    if (!state) return;

    switch (state.step) {
        case 1:
            state.data.nombre_cliente = message;
            state.step = 2;
            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: "📱 Ahora escribe el *número de WhatsApp* del cliente (solo números):" }
            });
            break;

        case 2:
            state.data.numero_whatsapp = message.replace(/\D/g, "");
            state.step = 3;
            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: "🛠️ Describe brevemente el *trabajo a realizar*:" }
            });
            break;

        case 3:
            state.data.descripcion_trabajo = message;
            state.step = 4;
            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: "💰 Finalmente escribe el *valor total del pedido*:" }
            });
            break;

        case 4:
            state.data.valor_total = Number(message.replace(/\D/g, ""));
            const order = await createOrder(state.data);

            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: {
                    body: `✅ *Pedido creado correctamente*\n\nCódigo: *${order.order_code}*\nCliente: ${order.nombre_cliente}\nValor total: ${order.valor_total.toLocaleString()}\n\nEstado: pendiente de anticipo`
                }
            });

            // Borrar estado temporal
            delete newOrderState[admin];
            break;

        default:
            delete newOrderState[admin];
    }
}
