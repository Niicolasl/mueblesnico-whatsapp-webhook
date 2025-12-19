import { createOrder } from "../db/orders.js";
import { sendMessage } from "../services/whatsappSender.js";

export const newOrderState = {};

/*
 Flujo:
 Paso 1 → nombre
 Paso 2 → número
 Paso 3 → descripción
 Paso 4 → valor total
 Paso 5 → confirmación
*/

export async function startNewOrderFlow(admin) {
    newOrderState[admin] = {
        step: 1,
        data: {}
    };

    await sendMessage(admin, {
        messaging_product: "whatsapp",
        text: {
            body: "✏️ *Nuevo Pedido*\n\nEscribe el *nombre del cliente*:\n\n❌ Escribe */no* para cancelar"
        }
    });
}

export async function handleNewOrderStep(admin, message) {
    const state = newOrderState[admin];
    if (!state) return;

    // ❌ Cancelación global
    if (message.toLowerCase() === "/no") {
        delete newOrderState[admin];
        await sendMessage(admin, {
            messaging_product: "whatsapp",
            text: { body: "❌ Pedido cancelado correctamente." }
        });
        return;
    }

    switch (state.step) {
        case 1:
            state.data.nombre_cliente = message;
            state.step = 2;
            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: {
                    body: "📱 Escribe el *número de WhatsApp* del cliente (10 dígitos, sin 57):"
                }
            });
            break;

        case 2: {
            const numero = message.replace(/\D/g, "");

            if (numero.length !== 10) {
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body: "⚠️ El número debe tener *10 dígitos* (Colombia, sin 57). Intenta nuevamente:"
                    }
                });
                return;
            }

            state.data.numero_whatsapp = numero;
            state.step = 3;
            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: "🛠️ Describe brevemente el *trabajo a realizar*:" }
            });
            break;
        }

        case 3:
            state.data.descripcion_trabajo = message;
            state.step = 4;
            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: "💰 Escribe el *valor total del pedido* (solo números):" }
            });
            break;

        case 4: {
            const valor = Number(message.replace(/\D/g, ""));

            if (!valor || valor <= 0) {
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body: "⚠️ El valor debe ser un número mayor a 0. Intenta nuevamente:"
                    }
                });
                return;
            }

            state.data.valor_total = valor;
            state.step = 5;

            const resumen = `
📋 *Confirma el pedido*

👤 Cliente: ${state.data.nombre_cliente}
📱 Teléfono: ${state.data.numero_whatsapp}
🛠️ Trabajo: ${state.data.descripcion_trabajo}
💰 Valor: ${valor.toLocaleString()}

✅ Responde *SI* para confirmar
❌ Escribe */no* para cancelar
`;

            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: resumen }
            });
            break;
        }

        case 5:
            if (message.toLowerCase() === "si") {
                const order = await createOrder(state.data);

                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body: `✅ *Pedido creado correctamente*\n\nCódigo: *${order.order_code}*\nCliente: ${order.nombre_cliente}\nValor total: ${order.valor_total.toLocaleString()}\n\nEstado: pendiente de anticipo`
                    }
                });

                delete newOrderState[admin];
            } else {
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body: "⚠️ Responde *SI* para confirmar o */no* para cancelar."
                    }
                });
            }
            break;

        default:
            delete newOrderState[admin];
    }
}
