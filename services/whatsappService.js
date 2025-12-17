import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState
} from "../flows/newOrderFlow.js";

import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";

import {
  pedirDatoSaldo,
  saldoNoEncontrado,
  saldoUnPedido,
  seleccionarPedidoSaldo,
  menuPrincipal
} from "../utils/messageTemplates.js";

import { sendMessage } from "./whatsappSender.js";
import {
  normalizarTelefono,
  telefonoParaWhatsApp
} from "../utils/phone.js";

const ADMINS = [
  "3204128555",
  "3125906313"
];

// 🔧 Helper envío
const enviar = async (to, payload) => {
  const toWhatsapp = telefonoParaWhatsApp(to);

  if (payload?.type === "interactive") {
    return sendMessage(toWhatsapp, {
      type: "interactive",
      interactive: payload.interactive
    });
  }

  return sendMessage(toWhatsapp, payload);
};

export const handleMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    // 📞 Número entrante normalizado (SIN 57)
    const from = normalizarTelefono(message.from);

    let text = message.text?.body?.trim() || "";
    let interactiveId = null;

    if (message.interactive?.list_reply) {
      interactiveId = message.interactive.list_reply.id;
    }
    if (message.interactive?.button_reply) {
      interactiveId = message.interactive.button_reply.id;
    }

    const input = interactiveId ?? text;
    const inputLower = typeof input === "string" ? input.toLowerCase() : "";

    console.log("📩 INPUT:", input, "FROM:", from);

    if (!global.estadoCliente) global.estadoCliente = {};
    const estado = global.estadoCliente;

    const esAdmin = ADMINS.includes(from);

    // =====================================================
    // 🟪 SALDO (esperando dato)
    // =====================================================
    if (estado[from] === "esperando_dato_saldo") {

      // 👇 normalizamos SOLO si parece teléfono
      let dato = text;
      if (/^\+?\d{10,15}$/.test(text)) {
        dato = normalizarTelefono(text);
      }

      const resultado = await consultarSaldo(dato);

      if (resultado?.error || !Array.isArray(resultado)) {
        await enviar(from, saldoNoEncontrado());
        delete estado[from];
        return res.sendStatus(200);
      }

      if (resultado.length === 1) {
        await enviar(from, saldoUnPedido(resultado[0]));
      } else {
        await enviar(from, seleccionarPedidoSaldo(resultado));
      }

      delete estado[from];
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟦 MENU
    // =====================================================
    if (inputLower === "menu" || inputLower === "menú") {
      delete estado[from];
      delete newOrderState[from];
      await enviar(from, menuPrincipal());
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
    // 🟦 CLIENTE: OPCIONES MENÚ
    // =====================================================
    if (input === "COTIZAR") {
      await enviar(from, {
        text: { body: "🪑 Perfecto, cuéntanos qué mueble necesitas cotizar." }
      });
      return res.sendStatus(200);
    }

    if (input === "PEDIDO") {
      const r = await consultarPedido(from);
      await enviar(from, r);
      return res.sendStatus(200);
    }

    if (input === "SALDO") {
      estado[from] = "esperando_dato_saldo";
      await enviar(from, pedirDatoSaldo());
      return res.sendStatus(200);
    }

    if (input === "GARANTIA") {
      await enviar(from, {
        text: {
          body: "🛡️ Todos nuestros muebles cuentan con garantía por defectos de fabricación."
        }
      });
      return res.sendStatus(200);
    }

    if (input === "TIEMPOS") {
      await enviar(from, {
        text: {
          body: "⏱️ Los tiempos de entrega dependen del proyecto. Escríbenos para más detalle."
        }
      });
      return res.sendStatus(200);
    }

    if (input === "ASESOR") {
      await enviar(from, {
        text: { body: "📞 Un asesor te contactará pronto." }
      });
      return res.sendStatus(200);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error:", err);
    return res.sendStatus(500);
  }
};
