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
    let text = message.text?.body?.trim() || "";
    const textLower = text.toLowerCase();
    let interactiveId = null;

    if (message.interactive?.list_reply) {
      interactiveId = message.interactive.list_reply.id;
    }

    if (message.interactive?.button_reply) {
      interactiveId = message.interactive.button_reply.id;
    }

    const input = interactiveId ?? text;
    const inputLower = typeof input === "string" ? input.toLowerCase() : "";

    console.log("📩 INPUT:", input);

    if (!global.estadoCliente) global.estadoCliente = {};
    const estado = global.estadoCliente;

    const esAdmin = ADMINS.includes(from);

    // =====================================================
    // 🟦 MENU GLOBAL
    // =====================================================
    if (inputLower === "menu" || inputLower === "menú") {
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
    if (esAdmin && inputLower === "/nuevo_pedido") {
      await startNewOrderFlow(from);
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟨 ADMIN: CONTINUAR FLUJO
    // =====================================================
    if (esAdmin && newOrderState[from]) {
      await handleNewOrderStep(from, text);
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟦 CLIENTE: OPCIONES DEL MENÚ
    // =====================================================
    if (!esAdmin) {

      if (input === "COTIZAR") {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: { body: "🪑 Perfecto, cuéntanos qué mueble necesitas cotizar." }
        });
        return res.sendStatus(200);
      }

      if (input === "PEDIDO") {
        const r = await consultarPedido(from);
        r.to = from;
        await sendMessage(from, r);
        return res.sendStatus(200);
      }

      if (input === "SALDO") {
        estado[from] = "esperando_dato_saldo";
        const p = pedirDatoSaldo();
        p.to = from;
        await sendMessage(from, p);
        return res.sendStatus(200);
      }

      if (input === "GARANTIA") {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: "🛡️ Todos nuestros muebles cuentan con garantía por defectos de fabricación."
          }
        });
        return res.sendStatus(200);
      }

      if (input === "TIEMPOS") {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: "⏱️ Los tiempos de entrega dependen del proyecto. Escríbenos para más detalle."
          }
        });
        return res.sendStatus(200);
      }

      if (input === "ASESOR") {
        await sendMessage(from, {
          messaging_product: "whatsapp",
          text: {
            body: "📞 Un asesor te contactará pronto."
          }
        });
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 🟪 TEXTO PARA SALDO
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
