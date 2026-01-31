import { createOrder } from "../db/orders.js";
import { sendMessage } from "../services/whatsappSender.js";
import {
    sincronizarEtiquetasCliente,
    actualizarAtributosCliente
} from "../services/chatwootService.js";

/**
 * Estado del flujo por admin
 * adminPhone -> { step, data }
 */
export const newOrderState = {};

/**
 * Paso 1: iniciar flujo
 */
export async function startNewOrderFlow(admin) {
    newOrderState[admin] = {
        step: 1,
        data: {}
    };

    await sendMessage(admin, {
        messaging_product: "whatsapp",
        text: {
            body:
                "✏️ *Nuevo Pedido*\n\n" +
                "Escribe el *nombre del cliente*:\n\n" +
                "❌ Escribe */no* para cancelar"
        }
    });
}

/**
 * Manejo de cada paso
 */
export async function handleNewOrderStep(admin, message) {
    const state = newOrderState[admin];
    if (!state) return;

    const texto = message.trim();

    // ❌ Cancelación global
    if (texto.toLowerCase() === "/no") {
        delete newOrderState[admin];
        await sendMessage(admin, {
            messaging_product: "whatsapp",
            text: { body: "❌ Pedido cancelado correctamente." }
        });
        return;
    }

    switch (state.step) {
        /** ---------------- PASO 1 ---------------- */
        case 1:
            state.data.nombre_cliente = texto;
            state.step = 2;

            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: {
                    body:
                        "📱 Escribe el *número de WhatsApp* del cliente\n" +
                        "(10 dígitos, Colombia, sin 57):"
                }
            });
            break;

        /** ---------------- PASO 2 ---------------- */
        case 2: {
            const numero = texto.replace(/\D/g, "");

            if (numero.length !== 10) {
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body:
                            "⚠️ El número debe tener *10 dígitos* (sin 57).\n" +
                            "Intenta nuevamente:"
                    }
                });
                return;
            }

            state.data.numero_whatsapp = numero;
            state.step = 3;

            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: {
                    body: "🛠️ Describe brevemente el *trabajo a realizar*:"
                }
            });
            break;
        }

        /** ---------------- PASO 3 ---------------- */
        case 3:
            state.data.descripcion_trabajo = texto;
            state.step = 4;

            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: {
                    body: "💰 Escribe el *valor total del pedido* (solo números):"
                }
            });
            break;

        /** ---------------- PASO 4 ---------------- */
        case 4: {
            const base = Number(texto.replace(/\D/g, ""));
            const valor = base * 1000;

            if (!base || base <= 0) {
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body:
                            "⚠️ El valor debe ser un número mayor a 0.\n" +
                            "Intenta nuevamente:"
                    }
                });
                return;
            }

            state.data.valor_total = valor;
            state.step = 5;

            const resumen =
                "📋 *Confirma el pedido*\n\n" +
                `👤 Cliente: ${state.data.nombre_cliente}\n` +
                `📱 Teléfono: ${state.data.numero_whatsapp}\n` +
                `🛠️ Trabajo: ${state.data.descripcion_trabajo}\n` +
                `💰 Valor: $${valor.toLocaleString()}\n\n` +
                "✅ Responde *SI* para confirmar\n" +
                "❌ Escribe */no* para cancelar";

            await sendMessage(admin, {
                messaging_product: "whatsapp",
                text: { body: resumen }
            });
            break;
        }

        /** ---------------- PASO 5 ---------------- */
        case 5:
            if (texto.toLowerCase() === "si") {
                const order = await createOrder(state.data);

                // ✅ Confirmación al ADMIN
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body:
                            "✅ *Pedido creado correctamente*\n\n" +
                            `Código: *${order.order_code}*\n` +
                            `Cliente: ${order.nombre_cliente}\n` +
                            `Valor total: $${Number(order.valor_total).toLocaleString()}\n\n` +
                            "📌 Estado: Pendiente de anticipo"
                    }
                });

                // 📲 NOTIFICACIÓN AL CLIENTE (FORMATO COMPLETO)
                await sendMessage(order.numero_whatsapp, {
                    messaging_product: "whatsapp",
                    text: {
                        body:
                            "📝 *Pedido registrado*\n\n" +
                            `📦 Código: *${order.order_code}*\n` +
                            `🛠️ Trabajo: ${order.descripcion_trabajo}\n` +
                            `💰 Valor total: $${Number(order.valor_total).toLocaleString()}\n\n` +
                            "📌 Estado actual: *Pendiente de anticipo*\n" +
                            "Te avisaremos cuando haya novedades 🙌"
                    }
                });
                await sendMessage(order.numero_whatsapp, {
                    messaging_product: "whatsapp",
                    text: {
                        body: `Puedes escribir *menú* para ver el estado y saldo de tus pedidos`,
                    },
                });

                // 🏷️ SINCRONIZAR CHATWOOT
                try {
                    await sincronizarEtiquetasCliente(order.numero_whatsapp);
                    await actualizarAtributosCliente(order.numero_whatsapp);
                    console.log(`✅ Chatwoot sincronizado para pedido ${order.order_code}`);
                } catch (err) {
                    console.error("⚠️ Error sincronizando Chatwoot:", err.message);
                }

                delete newOrderState[admin];
            } else {
                await sendMessage(admin, {
                    messaging_product: "whatsapp",
                    text: {
                        body:
                            "⚠️ Responde *SI* para confirmar o */no* para cancelar."
                    }
                });
            }
            break;

        default:
            delete newOrderState[admin];
    }
}