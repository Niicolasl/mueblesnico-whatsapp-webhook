import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState
} from "../flows/newOrderFlow.js";

import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { getOrder } from "../db/orders.js";


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
const adminState = {};

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
    if (esAdmin && inputLower === "/nuevop") {
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
    // 🟩 ADMIN: ANTICIPO
    // =====================================================

    if (inputLower === "/anticipo") {
      adminState[from] = { step: "anticipo_codigo" };

      await enviar(from, {
        text: "📌 Ingresa el *código del pedido* (ej: MN-2025-0004)"
      });

      return res.sendStatus(200);
    }

    if (adminState[from]?.step === "anticipo_codigo") {
      adminState[from].orderCode = input.toUpperCase();
      adminState[from].step = "anticipo_valor";

      await enviar(from, {
        text: "💵 Ingresa el *valor abonado*"
      });

      return res.sendStatus(200);
    }

    if (adminState[from]?.step === "anticipo_valor") {
      const valor = Number(input.replace(/[^\d]/g, ""));

      if (!valor || valor <= 0) {
        await enviar(from, {
          text: "❌ Valor inválido. Ingresa solo números."
        });
        return res.sendStatus(200);
      }

      const result = await registrarAnticipo(
        adminState[from].orderCode,
        valor
      );

      delete adminState[from];

      if (!result) {
        await enviar(from, {
          text: "❌ No se pudo registrar el anticipo. Verifica el código."
        });
        return res.sendStatus(200);
      }

      // ✅ Mensaje al ADMIN
      await enviar(from, {
        text:
          `✅ *Anticipo registrado*\n\n` +
          `Pedido: ${result.order_code}\n` +
          `Abonado total: $${Number(result.valor_abonado).toLocaleString()}\n` +
          `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}`
      });

      // ✅ Mensaje al CLIENTE
      let mensajeCliente =
        `💳 *Hemos recibido tu abono*\n\n` +
        `Pedido: ${result.order_code}\n` +
        `Abonado: $${valor.toLocaleString()}\n` +
        `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}`;

      if (Number(result.saldo_pendiente) <= 0) {
        mensajeCliente =
          `🎉 *¡Pago completado!*\n\n` +
          `Tu pedido *${result.order_code}* ya se encuentra completamente pagado.\n` +
          `En breve te contactaremos para continuar con el proceso.`;
      }

      await enviar(result.numero_whatsapp, {
        text: mensajeCliente
      });

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
      const pedidos = await consultarSaldo(from);

      if (pedidos?.error || !Array.isArray(pedidos)) {
        await enviar(from, {
          text: {
            body: "📭 No encontramos pedidos activos asociados a este número."
          }
        });
        return res.sendStatus(200);
      }

      // 🟢 Un solo pedido → mensaje directo
      if (pedidos.length === 1) {
        await enviar(from, saldoUnPedido(pedidos[0]));
        return res.sendStatus(200);
      }

      // 🟢 Varios pedidos → lista
      await enviar(from, seleccionarPedidoSaldo(pedidos));
      return res.sendStatus(200);
    }

    // =====================================================
    // 💵 CLIENTE: ABONAR PEDIDO
    // =====================================================
    if (input === "ABONAR") {
      await enviar(from, infoMediosPago());
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
    // =====================================================
    // 💰 CLIENTE: SELECCIÓN DE PEDIDO DESDE SALDO
    // =====================================================
    if (typeof input === "string" && input.startsWith("SALDO_")) {
      const id = input.replace("SALDO_", "").trim();

      if (!/^\d+$/.test(id)) {
        return res.sendStatus(200);
      }

      const pedidos = await consultarSaldo(from);

      if (!Array.isArray(pedidos)) {
        await enviar(from, {
          text: { body: "❌ No pudimos obtener la información del pedido." }
        });
        return res.sendStatus(200);
      }

      const pedido = pedidos.find(p => String(p.id) === id);

      if (!pedido) {
        await enviar(from, {
          text: { body: "❌ Pedido no encontrado o no pertenece a este número." }
        });
        return res.sendStatus(200);
      }

      await enviar(from, saldoUnPedido(pedido));
      return res.sendStatus(200);
    }


    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error:", err);
    return res.sendStatus(500);
  }
};
