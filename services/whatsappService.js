import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { registrarAnticipo } from "../db/anticipo.js";
import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState
} from "../flows/newOrderFlow.js";


import {
  pedirDatoSaldo,
  saldoNoEncontrado,
  saldoUnPedido,
  seleccionarPedidoSaldo,
  menuPrincipal,
} from "../utils/messageTemplates.js";

import { sendMessage } from "./whatsappSender.js";

const ADMINS = [
  "573204128555",
  "573125906313"
];

export const handleMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.trim() || "";

    // -------------------------------
    // ESTADO EN MEMORIA
    // -------------------------------
    if (!global.estadoCliente) global.estadoCliente = {};
    const estado = global.estadoCliente;

    const esAdmin = ADMINS.includes(from);

    if (esAdmin && text.toLowerCase() === "/nuevo_pedido") {
      await startNewOrderFlow(from);
      return res.sendStatus(200);
    }

    // Continuar flujo si el admin ya está en proceso
    if (esAdmin && newOrderState[from]) {
      await handleNewOrderStep(from, text);
      return res.sendStatus(200);
    }
    // =====================================================
    // 🟥 COMANDO ADMIN: /cancelar MN-XXXX
    // =====================================================
    if (esAdmin && text.toLowerCase().startsWith("/cancelar")) {
      const partes = text.split(" ");
      const orderCode = partes[1]?.toUpperCase();

      if (!orderCode) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: "❌ Debes indicar el código del pedido.\nEjemplo:\n/cancelar MN-2025-0004"
          }
        });
        return res.sendStatus(200);
      }

      const resultado = await cancelarPedido(orderCode);


      if (!resultado || resultado === "error") {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: `❌ No se pudo cancelar el pedido ${orderCode}.\nPuede no existir o ya estar cancelado.`
          }
        });
        return res.sendStatus(200);
      }

      // ✅ ADMIN
      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: {
          body: `✅ Pedido *${orderCode}* cancelado correctamente.`
        }
      });

      // 📩 CLIENTE
      const cliente = resultado.numero_whatsapp.replace("+", "");
      await sendMessage(cliente, {
        messaging_product: "whatsapp",
        text: {
          body:
            `❌ *Tu pedido ${orderCode} ha sido cancelado.*

Si tienes dudas o deseas un nuevo pedido, escribe *menu* y con gusto te ayudamos.`
        }
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 COMANDO ADMIN: /anticipo MN-XXXX VALOR
    // =====================================================
    if (esAdmin && text.toLowerCase().startsWith("/anticipo")) {
      const partes = text.split(" ");

      if (partes.length !== 3) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: "❌ Formato incorrecto.\nEjemplo:\n/anticipo MN-2025-0004 500000"
          }
        });
        return res.sendStatus(200);
      }

      const orderCode = partes[1].toUpperCase();
      const valor = Number(partes[2]);

      if (isNaN(valor) || valor <= 0) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: { body: "❌ El valor del anticipo debe ser un número válido." }
        });
        return res.sendStatus(200);
      }

      const pedido = await registrarAnticipo(orderCode, valor);

      if (!pedido) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: `❌ No se encontró el pedido ${orderCode} o está cancelado.`
          }
        });
        return res.sendStatus(200);
      }

      // ✅ ADMIN
      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: {
          body:
            `✅ *Anticipo registrado*

📦 Pedido: ${pedido.order_code}
💰 Abonado total: $${Number(pedido.valor_abonado).toLocaleString()}
💳 Saldo pendiente: $${Number(pedido.saldo_pendiente).toLocaleString()}
📅 Entrega estimada: ${pedido.fecha_aprox_entrega}`
        }
      });

      // 📩 CLIENTE
      if (pedido.numero_whatsapp) {
        const cliente = pedido.numero_whatsapp.replace("+", "");
        await sendMessage(cliente, {
          messaging_product: "whatsapp",
          text: {
            body:
              `📦 *Actualización de tu pedido ${pedido.order_code}*

💰 Hemos recibido un anticipo de $${valor.toLocaleString()}.
💳 Saldo pendiente: $${Number(pedido.saldo_pendiente).toLocaleString()}
📅 Entrega estimada: ${pedido.fecha_aprox_entrega}

Gracias por confiar en *Muebles Nico*.`
          }
        });
      }

      return res.sendStatus(200);
    }

    // -------------------------------
    // MENÚ PRINCIPAL
    // -------------------------------
    if (["menu", "menú"].includes(text.toLowerCase())) {
      const body = menuPrincipal();
      body.to = from;
      await sendMessage(from, body);
      return res.sendStatus(200);
    }

    // -------------------------------
    // BOTONES
    // -------------------------------
    if (message.type === "interactive" && message.interactive?.button_reply) {
      const id = message.interactive.button_reply.id;

      if (id === "SALDO") {
        estado[from] = "esperando_dato_saldo";
        const plantilla = pedirDatoSaldo();
        plantilla.to = from;
        await sendMessage(from, plantilla);
        return res.sendStatus(200);
      }

      if (id === "PEDIDO") {
        const respuesta = await consultarPedido(from);
        respuesta.to = from;
        await sendMessage(from, respuesta);
        return res.sendStatus(200);
      }
    }

    // -------------------------------
    // LISTA SALDO
    // -------------------------------
    if (message.type === "interactive" && message.interactive?.list_reply) {
      const rowId = message.interactive.list_reply.id;

      if (rowId.startsWith("SALDO_")) {
        const id = rowId.replace("SALDO_", "");
        const pedidos = await consultarSaldo(id);

        if (!pedidos || pedidos.error || pedidos.length === 0) {
          const plantilla = saldoNoEncontrado();
          plantilla.to = from;
          await sendMessage(from, plantilla);
          return res.sendStatus(200);
        }

        const plantilla = saldoUnPedido(pedidos[0]);
        plantilla.to = from;
        await sendMessage(from, plantilla);
        return res.sendStatus(200);
      }
    }

    // -------------------------------
    // TEXTO PARA SALDO
    // -------------------------------
    if (estado[from] === "esperando_dato_saldo") {
      const pedidos = await consultarSaldo(text);

      if (!pedidos || pedidos.error) {
        const plantilla = saldoNoEncontrado();
        plantilla.to = from;
        await sendMessage(from, plantilla);
        return res.sendStatus(200);
      }

      if (pedidos.length === 1) {
        const plantilla = saldoUnPedido(pedidos[0]);
        plantilla.to = from;
        await sendMessage(from, plantilla);
        delete estado[from];
        return res.sendStatus(200);
      }

      const plantilla = seleccionarPedidoSaldo(pedidos);
      plantilla.to = from;
      await sendMessage(from, plantilla);
      delete estado[from];
      return res.sendStatus(200);
    }

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error procesando mensaje:", error);
    return res.sendStatus(500);
  }
};
