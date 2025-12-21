import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState
} from "../flows/newOrderFlow.js";

import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { infoMediosPago } from "../utils/messageTemplates.js";
import { registrarAnticipo } from "../db/anticipo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { obtenerPedidoActivo } from "../db/validarPedidoActivo.js";
import { actualizarEstadoPedido } from "../db/actualizarEstadoPedido.js";




import {
  estadoPedidoTemplate,
  seleccionarPedidoEstado
} from "../utils/messageTemplates.js";


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
    // ❌ ADMIN: CANCELAR PEDIDO
    // =====================================================
    if (esAdmin && inputLower === "/cancelar") {
      adminState[from] = { step: "cancelar_codigo" };

      await enviar(from, {
        text: {
          body: "📌 Ingresa el *código del pedido* a cancelar"
        }
      });

      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "cancelar_codigo") {
      const orderCode = input.toUpperCase();

      const result = await cancelarPedido(orderCode);

      if (result === null) {
        await enviar(from, {
          text: {
            body: "⚠️ El pedido no existe o ya estaba cancelado."
          }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (result === "error") {
        await enviar(from, {
          text: {
            body: "❌ Ocurrió un error al cancelar el pedido."
          }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      await enviar(from, {
        text: {
          body:
            `❌ *Pedido cancelado*\n\n` +
            `Pedido: ${result.order_code}`
        }
      });

      delete adminState[from];
      return res.sendStatus(200);
    }

    // =====================================================
    // =====================================================
    // 🟩 ADMIN: CAMBIO DE ESTADO MANUAL (ÚNICO)
    // =====================================================

    const comandosEstado = {
      "/panticipo": "PENDIENTE_ANTICIPO",
      "/listo": "LISTO",
      "/entregado": "ENTREGADO"
    };

    if (esAdmin && comandosEstado[inputLower]) {
      adminState[from] = {
        step: "estado_codigo",
        nuevoEstado: comandosEstado[inputLower]
      };

      await enviar(from, {
        text: { body: "📌 Ingresa el *código del pedido*" }
      });

      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "estado_codigo") {
      const orderCode = input.toUpperCase();
      const nuevoEstado = adminState[from].nuevoEstado;

      const validacion = await obtenerPedidoActivo(orderCode);

      if (validacion.error === "NO_EXISTE") {
        await enviar(from, { text: { body: "❌ Pedido no encontrado." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "CANCELADO") {
        await enviar(from, {
          text: { body: "⛔ Este pedido está CANCELADO y no admite cambios." }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const pedido = await actualizarEstadoPedido(orderCode, nuevoEstado);

      delete adminState[from];

      await enviar(from, {
        text: {
          body:
            `✅ *Estado actualizado*\n\n` +
            `Pedido: ${pedido.order_code}\n` +
            `Nuevo estado: ${nuevoEstado.replace("_", " ")}`
        }
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: ANTICIPO
    // =====================================================

    if (esAdmin && inputLower === "/anticipo") {
      adminState[from] = { step: "anticipo_codigo" };

      await enviar(from, {
        text: {
          body: "📌 Ingresa el *código del pedido* (ej: MN-2025-0004)"
        }
      });

      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "anticipo_codigo") {
      const codigo = input.toUpperCase();

      const validacion = await obtenerPedidoActivo(codigo);

      if (validacion.error === "NO_EXISTE") {
        await enviar(from, {
          text: { body: "❌ El pedido no existe." }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "CANCELADO") {
        await enviar(from, {
          text: { body: "❌ Este pedido está CANCELADO y no admite cambios." }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      adminState[from].orderCode = codigo;
      adminState[from].step = "anticipo_valor";

      await enviar(from, {
        text: { body: "💵 Ingresa el *valor abonado*" }
      });

      return res.sendStatus(200);
    }


    if (esAdmin && adminState[from]?.step === "anticipo_valor") {
      const valor = Number(input.replace(/[^\d]/g, ""));

      if (!valor || valor <= 0) {
        await enviar(from, {
          text: {
            body: "❌ Valor inválido. Ingresa solo números."
          }
        });
        return res.sendStatus(200);
      }

      const result = await registrarAnticipo(
        adminState[from].orderCode,
        valor
      );

      if (result?.error === "EXCEDE_SALDO") {
        await enviar(from, {
          text: {
            body:
              `❌ El valor ingresado excede el saldo pendiente.\n\n` +
              `Saldo actual: $${Number(result.saldo).toLocaleString()}`
          }
        });
        return res.sendStatus(200);
      }

      if (result?.error === "PAGADO") {
        await enviar(from, {
          text: {
            body: "✅ Este pedido ya se encuentra completamente pagado."
          }
        });
        return res.sendStatus(200);
      }


      delete adminState[from];

      if (!result) {
        await enviar(from, {
          text: {
            body: "❌ No se pudo registrar el anticipo. Verifica el código."
          }
        });
        return res.sendStatus(200);
      }

      // ✅ Mensaje al ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Anticipo registrado*\n\n` +
            `Pedido: ${result.order_code}\n` +
            `Abonado total: $${Number(result.valor_abonado).toLocaleString()}\n` +
            `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}`
        }
      });

      // ✅ Mensaje al CLIENTE
      let mensajeCliente =
        `💳 *Hemos recibido tu abono*\n\n` +
        `Pedido: ${result.order_code}\n` +
        `Abono recibido: $${valor.toLocaleString()}\n` +
        `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}\n\n` +
        `Gracias por tu pago 🙌`;

      if (Number(result.saldo_pendiente) <= 0) {
        mensajeCliente =
          `🎉 *¡Pago completado!*\n\n` +
          `Tu pedido *${result.order_code}* ya se encuentra completamente pagado.\n` +
          `¡Gracias por confiar en Muebles Nico!`;
      }

      await enviar(result.numero_whatsapp, {
        text: {
          body: mensajeCliente
        }
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
      const pedidos = await consultarPedido(from);

      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, {
          text: { body: "📭 No encontramos pedidos activos asociados a este número." }
        });
        return res.sendStatus(200);
      }

      // 🟢 Un solo pedido → estado directo
      if (pedidos.length === 1) {
        await enviar(from, estadoPedidoTemplate(pedidos[0]));
        return res.sendStatus(200);
      }

      // 🟢 Varios pedidos → lista
      await enviar(from, seleccionarPedidoEstado(pedidos));
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

    // =====================================================
    // 📦 CLIENTE: SELECCIÓN DE PEDIDO DESDE ESTADO
    // =====================================================
    if (typeof input === "string" && input.startsWith("PEDIDO_")) {
      const id = input.replace("PEDIDO_", "").trim();

      if (!/^\d+$/.test(id)) {
        return res.sendStatus(200);
      }

      const pedidos = await consultarPedido(from);

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

      await enviar(from, estadoPedidoTemplate(pedido));
      return res.sendStatus(200);
    }



    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error:", err);
    return res.sendStatus(500);
  }
};
