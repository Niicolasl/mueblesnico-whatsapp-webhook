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
    const textLower = text.toLowerCase();

    if (!global.estadoCliente) global.estadoCliente = {};
    const estado = global.estadoCliente;

    const esAdmin = ADMINS.includes(from);

    // =====================================================
    // 🟦 MENU (PRIORIDAD MÁXIMA)
    // =====================================================
    if (["menu", "menú"].includes(textLower)) {
      // salir de cualquier flujo
      delete estado[from];
      delete newOrderState[from];

      const body = menuPrincipal();
      body.to = from;
      await sendMessage(from, body);
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: NUEVO PEDIDO
    // =====================================================
    if (esAdmin && textLower === "/nuevo_pedido") {
      await startNewOrderFlow(from);
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟥 ADMIN: CANCELAR PEDIDO
    // =====================================================
    if (esAdmin && textLower.startsWith("/cancelar")) {
      const partes = text.split(" ");
      const orderCode = partes[1]?.toUpperCase();

      if (!orderCode) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: { body: "❌ Uso correcto:\n/cancelar MN-2025-0004" }
        });
        return res.sendStatus(200);
      }

      const resultado = await cancelarPedido(orderCode);

      if (!resultado) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: { body: `❌ No se pudo cancelar ${orderCode}` }
        });
        return res.sendStatus(200);
      }

      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: { body: `✅ Pedido *${orderCode}* cancelado.` }
      });

      const cliente = resultado.numero_whatsapp.replace("+", "");
      await sendMessage(cliente, {
        messaging_product: "whatsapp",
        text: {
          body: `❌ Tu pedido *${orderCode}* fue cancelado.\nEscribe *menu* si necesitas ayuda.`
        }
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: ANTICIPO
    // =====================================================
    if (esAdmin && textLower.startsWith("/anticipo")) {
      const partes = text.split(" ");
      if (partes.length !== 3) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: { body: "❌ Uso:\n/anticipo MN-2025-0004 500000" }
        });
        return res.sendStatus(200);
      }

      const pedido = await registrarAnticipo(
        partes[1].toUpperCase(),
        Number(partes[2])
      );

      if (!pedido) {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: { body: "❌ Pedido no encontrado o cancelado." }
        });
        return res.sendStatus(200);
      }

      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: {
          body:
            `✅ Anticipo registrado\n\n📦 ${pedido.order_code}\n💳 Saldo: $${Number(pedido.saldo_pendiente).toLocaleString()}`
        }
      });

      const cliente = pedido.numero_whatsapp.replace("+", "");
      await sendMessage(cliente, {
        messaging_product: "whatsapp",
        text: {
          body:
            `💰 Recibimos tu anticipo.\nSaldo pendiente: $${Number(pedido.saldo_pendiente).toLocaleString()}`
        }
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟨 CONTINUAR FLUJO NUEVO PEDIDO
    // =====================================================
    if (esAdmin && newOrderState[from]) {
      await handleNewOrderStep(from, text);
      return res.sendStatus(200);
    }

    // =====================================================
    // BOTONES
    // =====================================================
    if (message.type === "interactive" && message.interactive?.button_reply) {
      const id = message.interactive.button_reply.id;

      if (id === "SALDO") {
        estado[from] = "esperando_dato_saldo";
        const p = pedirDatoSaldo();
        p.to = from;
        await sendMessage(from, p);
        return res.sendStatus(200);
      }

      if (id === "PEDIDO") {
        const r = await consultarPedido(from);
        r.to = from;
        await sendMessage(from, r);
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // TEXTO SALDO
    // =====================================================
    if (estado[from] === "esperando_dato_saldo") {
      const pedidos = await consultarSaldo(text);

      if (!pedidos || pedidos.length === 0) {
        const p = saldoNoEncontrado();
        p.to = from;
        await sendMessage(from, p);
        return res.sendStatus(200);
      }

      if (pedidos.length === 1) {
        const p = saldoUnPedido(pedidos[0]);
        p.to = from;
        await sendMessage(from, p);
      } else {
        const p = seleccionarPedidoSaldo(pedidos);
        p.to = from;
        await sendMessage(from, p);
      }

      delete estado[from];
      return res.sendStatus(200);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error:", err);
    return res.sendStatus(500);
  }
};
