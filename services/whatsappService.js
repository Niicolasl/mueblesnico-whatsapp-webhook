import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState,
} from "../flows/newOrderFlow.js";

// 🛡️ Imports para Chatwoot y Clientes
import { getOrCreateClient } from "../db/clients.js";
import { forwardToChatwoot } from "../services/chatwootService.js";

// ⏱️ Timers de cotización (por cliente)
global.cotizacionTimers = global.cotizacionTimers || {};
global.estadoCotizacion = global.estadoCotizacion || {};
global.estadoCliente = global.estadoCliente || {};

import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { registrarAnticipo } from "../db/anticipo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { obtenerPedidoActivo } from "../db/validarPedidoActivo.js";
import { actualizarEstadoPedido } from "../db/actualizarEstadoPedido.js";
import { getPedidosByPhone } from "../db/orders.js";
import { obtenerSaludoColombia } from "../utils/saludos.js";

import {
  menuPrincipal,
  saldoNoEncontrado,
  pedirDatoSaldo,
  saldoUnPedido,
  seleccionarPedidoSaldo,
  seleccionarPedidoEstado,
  estadoPedidoTemplate,
  infoMediosPago,
} from "../utils/messageTemplates.js";

import { sendMessage } from "./whatsappSender.js";
import { normalizarTelefono, telefonoParaWhatsApp } from "../utils/phone.js";

const ADMINS = ["3204128555", "3125906313"];
const adminState = {};

// =====================================================
// 🔧 Helpers
// =====================================================
const enviar = async (to, payload) => {
  const toWhatsapp = telefonoParaWhatsApp(to);

  if (payload?.type === "interactive" || payload?.interactive) {
    return sendMessage(toWhatsapp, {
      type: "interactive",
      interactive: payload.interactive,
    });
  }

  return sendMessage(toWhatsapp, payload);
};

// Notificación automática de cambios de estado
async function notificarCambioEstado(pedido, enviar) {
  if (!pedido || !pedido.estado_pedido || !pedido.order_code || !pedido.numero_whatsapp) {
    console.error("❌ notificarCambioEstado recibió un pedido inválido:", pedido);
    return;
  }

  const saludoHora = obtenerSaludoColombia();
  let mensaje = null;
  const estado = pedido.estado_pedido.toUpperCase();

  if (estado === "LISTO") {
    mensaje = `Hola, ${saludoHora} 😊\n\n` +
      `Tu pedido *${pedido.order_code}* ya está listo 🎉\n` +
      `Cuando quieras, escríbeme y coordinamos la entrega.`;
  }

  if (estado === "ENTREGADO") {
    mensaje = `Hola 🙌\n\n` +
      `Quería avisarte que tu pedido *${pedido.order_code}* ya fue entregado con éxito ✅\n\n` +
      `Gracias por confiar en nosotros.\n` +
      `Si necesitas algo más, aquí estamos 😊`;
  }

  if (!mensaje) return;
  await enviar(pedido.numero_whatsapp, { text: { body: mensaje } });
}

const programarMensajeAsesor = async (from) => {
  if (global.cotizacionTimers[from]) {
    clearTimeout(global.cotizacionTimers[from]);
  }

  global.cotizacionTimers[from] = setTimeout(async () => {
    await enviar(from, {
      text: {
        body: "¡Gracias por la información! 😊" +
          "Ya tenemos todo lo necesario para continuar con tu cotización. " +
          "Apenas esté disponible, me comunicare contigo para darte el valor y resolver cualquier duda.",
      },
    });
    delete global.cotizacionTimers[from];
  }, 13 * 1000);
};

// =====================================================
// 📲 HANDLER PRINCIPAL
// =====================================================
export const handleMessage = async (req, res) => {
  try {
    if (!req.body?.entry) return res?.sendStatus(200);

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const contact = changes?.value?.contacts?.[0];
    const profileName = contact?.profile?.name || null;

    if (!message) return res.sendStatus(200);

    const from = normalizarTelefono(message.from);
    const client = await getOrCreateClient(from, profileName);

    // Cancelar timer si el cliente escribe
    if (global.estadoCotizacion?.[from] && global.cotizacionTimers?.[from]) {
      clearTimeout(global.cotizacionTimers[from]);
      delete global.cotizacionTimers[from];
    }

    let text = message.text?.body?.trim() || "";
    let interactiveId = null;

    if (message.interactive?.list_reply) interactiveId = message.interactive.list_reply.id;
    if (message.interactive?.button_reply) interactiveId = message.interactive.button_reply.id;

    let input = interactiveId ?? text;
    let inputLower = typeof input === "string" ? input.toLowerCase() : "";
    let forceCotizar = false;

    console.log("📩 INPUT:", input, "FROM:", from);
    
    // 🛡️ Sincronizar con Chatwoot (Versión optimizada)
    forwardToChatwoot(from, client.name, message).catch(err => {
      console.error("⚠️ Error en Chatwoot (silenciado):", err.message);
    });
    const estado = global.estadoCliente;
    const esAdmin = ADMINS.includes(from);

    // Detección "Cotizar"
    if (!global.estadoCotizacion?.[from] && !adminState[from] && /\bcotizar\b/.test(inputLower)) {
      forceCotizar = true;
    }

    // Saludos
    const saludos = ["hola", "holi", "hla", "buenas", "buen día", "buen dia", "buenos días", "buenos dias", "buenas tardes", "buenas noches", "holaa", "buenass", "saludos"];
    const esSaludo = saludos.some((s) => inputLower === s || inputLower.startsWith(s));

    if (esSaludo && !global.estadoCotizacion?.[from] && !adminState[from]) {
      const saludoHora = obtenerSaludoColombia();
      await enviar(from, { text: { body: `Hola, ${saludoHora} 😊\nEspero que estés muy bien.` } });
      if (!forceCotizar) {
        await enviar(from, { text: { body: "Escribe *Menú* en el momento que desees para ver todas las opciones, o si prefieres dime qué necesitas y con gusto te ayudo." } });
        return res.sendStatus(200);
      }
    }

    if (forceCotizar) input = "COTIZAR";

    // Esperando dato saldo
    if (estado[from] === "esperando_dato_saldo") {
      let dato = text;
      if (/^\+?\d{10,15}$/.test(text)) dato = normalizarTelefono(text);
      const resultado = await consultarSaldo(dato);
      if (resultado?.error || !Array.isArray(resultado)) {
        await enviar(from, saldoNoEncontrado());
      } else if (resultado.length === 1) {
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
      delete global.estadoCotizacion[from];
      delete newOrderState[from];
      await enviar(from, menuPrincipal());
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: NUEVO PEDIDO, CANCELAR, ESTADOS Y ABONOS
    // =====================================================
    if (esAdmin) {
      // Nuevo pedido
      if (inputLower === "/nuevop") {
        await startNewOrderFlow(from);
        return res.sendStatus(200);
      }
      if (newOrderState[from]) {
        await handleNewOrderStep(from, text);
        return res.sendStatus(200);
      }

      // Cancelar pedido
      if (inputLower === "/cancelar") {
        adminState[from] = { step: "cancelar_codigo" };
        await enviar(from, { text: { body: "📌 Ingresa el *código del pedido* a cancelar" } });
        return res.sendStatus(200);
      }

      if (adminState[from]?.step === "cancelar_codigo") {
        const orderCode = input.toUpperCase();
        const validacion = await obtenerPedidoActivo(orderCode);

        if (validacion.error === "NO_EXISTE") {
          await enviar(from, { text: { body: "❌ Pedido no encontrado." } });
          delete adminState[from];
          return res.sendStatus(200);
        }
        if (validacion.error === "CANCELADO") {
          await enviar(from, { text: { body: "⛔ Este pedido ya está cancelado." } });
          delete adminState[from];
          return res.sendStatus(200);
        }

        adminState[from] = { step: "confirmar_cancelacion", pedido: validacion.pedido };
        await enviar(from, {
          text: {
            body: "⚠️ *Confirma la cancelación*\n\n" +
              `Pedido: *${validacion.pedido.order_code}*\n` +
              `Trabajo: ${validacion.pedido.descripcion_trabajo}\n\n` +
              "Escribe *SI* para confirmar o *NO* para cancelar la acción.",
          },
        });
        return res.sendStatus(200);
      }

      if (adminState[from]?.step === "confirmar_cancelacion") {
        const respuesta = inputLower;
        const pedido = adminState[from].pedido;

        if (respuesta === "si") {
          const result = await cancelarPedido(pedido.order_code);
          if (result === "error") {
            await enviar(from, { text: { body: "❌ Ocurrió un error al cancelar el pedido." } });
          } else {
            await enviar(from, { text: { body: "❌ *Pedido cancelado correctamente*\n\n" + `Pedido: ${pedido.order_code}\n` + `Trabajo: ${pedido.descripcion_trabajo}` } });
            if (result.numero_whatsapp) {
              const saludoHora = obtenerSaludoColombia();
              await enviar(result.numero_whatsapp, { text: { body: `Hola, ${saludoHora} 😊\n\nQueremos informarte que tu pedido *${result.order_code}* ha sido cancelado.\n\n${result.descripcion_trabajo ? `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n` : ""}Si tienes alguna duda o deseas retomarlo, escríbenos y con gusto te ayudo 🤝` } });
            }
          }
        } else {
          await enviar(from, { text: { body: "❎ Cancelación abortada." } });
        }
        delete adminState[from];
        return res.sendStatus(200);
      }

      // Comandos de Estado (/listo, /entregado)
      const comandosEstado = { "/listo": "LISTO", "/entregado": "ENTREGADO" };
      if (comandosEstado[inputLower]) {
        adminState[from] = { step: "estado_codigo", nuevoEstado: comandosEstado[inputLower] };
        await enviar(from, { text: { body: "📌 Ingresa el *código del pedido*" } });
        return res.sendStatus(200);
      }

      if (adminState[from]?.step === "estado_codigo") {
        const orderCode = input.toUpperCase();
        const nuevoEstado = adminState[from].nuevoEstado;
        const validacion = await obtenerPedidoActivo(orderCode);

        if (validacion.error === "NO_EXISTE") {
          await enviar(from, { text: { body: "❌ Pedido no encontrado." } });
        } else if (validacion.error === "CANCELADO") {
          await enviar(from, { text: { body: "⛔ Este pedido está CANCELADO y no admite cambios." } });
        } else if (validacion.error === "FINALIZADO" && nuevoEstado !== "ENTREGADO") {
          await enviar(from, { text: { body: "⚠️ Este pedido ya fue finalizado.\n\nNo se puede cambiar su estado." } });
        } else {
          const pedidoAct = await actualizarEstadoPedido(orderCode, nuevoEstado);
          if (pedidoAct) {
            await notificarCambioEstado(pedidoAct, enviar);
            await enviar(from, { text: { body: `✅ *Estado actualizado*\n\nPedido: ${pedidoAct.order_code}\nNuevo estado: ${nuevoEstado.replace("_", " ")}` } });
          } else {
            await enviar(from, { text: { body: "❌ No se pudo actualizar el estado." } });
          }
        }
        delete adminState[from];
        return res.sendStatus(200);
      }

      // Abonos
      if (inputLower === "/abono") {
        adminState[from] = { step: "anticipo_codigo" };
        await enviar(from, { text: { body: "📌 Ingresa el *código del pedido*" } });
        return res.sendStatus(200);
      }

      if (adminState[from]?.step === "anticipo_codigo") {
        const codigo = input.toUpperCase();
        const validacion = await obtenerPedidoActivo(codigo);
        if (validacion.error === "NO_EXISTE") {
          await enviar(from, { text: { body: "❌ El pedido no existe." } });
          delete adminState[from];
        } else if (validacion.error === "CANCELADO") {
          await enviar(from, { text: { body: "❌ Este pedido está CANCELADO y no admite cambios." } });
          delete adminState[from];
        } else {
          const pedido = validacion.pedido;
          if (Number(pedido.saldo_pendiente) <= 0) {
            await enviar(from, { text: { body: "✅ Este pedido ya se encuentra *completamente pagado*." } });
            delete adminState[from];
          } else {
            adminState[from].orderCode = codigo;
            adminState[from].step = "anticipo_valor";
            await enviar(from, { text: { body: `💵 Ingresa el *valor abonado*\nSaldo pendiente: $${Number(pedido.saldo_pendiente).toLocaleString()}` } });
          }
        }
        return res.sendStatus(200);
      }

      if (adminState[from]?.step === "anticipo_valor") {
        const valor = Number(input.replace(/[^\d]/g, "")) * 1000;
        if (!valor || valor <= 0) {
          await enviar(from, { text: { body: "❌ Valor inválido. Ingresa solo números." } });
          return res.sendStatus(200);
        }
        const result = await registrarAnticipo(adminState[from].orderCode, valor);
        if (result?.error === "EXCEDE_SALDO") {
          await enviar(from, { text: { body: `❌ El valor ingresado excede el saldo pendiente.\n\nSaldo actual: $${Number(result.saldo).toLocaleString()}` } });
        } else if (result) {
          await enviar(from, { text: { body: `✅ *Anticipo registrado*\n\nPedido: ${result.order_code}\nSaldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}` } });
          let msgCl = `💳 *Hemos recibido tu abono*\n\nPedido: ${result.order_code}\nAbono: $${valor.toLocaleString()}\nSaldo: $${Number(result.saldo_pendiente).toLocaleString()}`;
          if (Number(result.saldo_pendiente) <= 0) msgCl = `🎉 *¡Pago completado!*\n\nTu pedido *${result.order_code}* ya está pagado. ¡Gracias!`;
          await enviar(result.numero_whatsapp, { text: { body: msgCl } });
          delete adminState[from];
        }
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 🟦 CLIENTE: FLUJO COTIZAR Y ACCIONES
    // =====================================================
    if (input === "COTIZAR") {
      global.estadoCotizacion[from] = { step: "tipoTrabajo" };
      await enviar(from, { text: { body: "🪑 *Ten en cuenta qué*\n\nPara los muebles que requieren *tapicería*:\n• Se cobra únicamente la *mano de obra*.\n• Los materiales los adquiere el cliente, ya que su precio varía según diseño y calidad.(yo te indico cuales serian)\n\nFabricamos y también *restauramos* muebles.\n\n" } });
      await enviar(from, { text: { body: "¿Qué es lo que necesitas hacer? 👇\n\n1️⃣ Fabricar un mueble nuevo\n2️⃣ Restaurar o tapizar un mueble\n3️⃣ Otro arreglo (reparaciones, rieles, chapas, instalación, etc.)\n\nRespóndeme con el número o escríbelo con tus propias palabras." } });
      return res.sendStatus(200);
    }

    if (global.estadoCotizacion?.[from]) {
      const estCot = global.estadoCotizacion[from];
      if (estCot.step === "tipoTrabajo") {
        if (["1", "fabricar", "nuevo"].some(x => inputLower.includes(x))) {
          await enviar(from, { text: { body: "🔹 *Fabricar mueble nuevo*\n\nCuéntame qué mueble tienes en mente 😊\nPuedes enviarme:\n• Fotos o referencias\n• Medidas aproximadas\n\nSi no estás segur@, también podemos asesorarte." } });
          estCot.step = "detalleTrabajo";
        } else if (["2", "restaurar", "tapizar"].some(x => inputLower.includes(x))) {
          await enviar(from, { text: { body: "🔹 *Restaurar o tapizar*\n\nEnvíame por favor:\n• Fotos actuales del mueble\n• Qué te gustaría cambiar o mejorar" } });
          estCot.step = "detalleTrabajo";
        } else {
          await enviar(from, { text: { body: "🔹 *Otro arreglo*\n\nCuéntame qué necesitas hacer y, si es posible,\nenvíame una foto del área o mueble." } });
          estCot.step = "detalleTrabajo";
        }
        return res.sendStatus(200);
      }
      if (estCot.step === "detalleTrabajo") {
        programarMensajeAsesor(from);
        delete global.estadoCotizacion[from];
        return res.sendStatus(200);
      }
    }

    if (input === "PEDIDO") {
      const pedidos = await getPedidosByPhone(from);
      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
      } else if (pedidos.length === 1) {
        if (pedidos[0].estado_pedido === "ENTREGADO") {
          await enviar(from, { text: { body: "✅ Este pedido ya fue entregado 🙌\n\nSi necesitas algo más o tienes alguna duda, escríbeme con confianza 😊" } });
        } else {
          await enviar(from, estadoPedidoTemplate(pedidos[0]));
        }
      } else {
        await enviar(from, seleccionarPedidoEstado(pedidos));
      }
      return res.sendStatus(200);
    }

    if (input === "SALDO") {
      const pedidos = await consultarSaldo(from);
      if (pedidos?.error || !Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
      } else if (pedidos.length === 1) {
        if (Number(pedidos[0].saldo) === 0) {
          await enviar(from, { text: { body: "💚 Este pedido ya fue pagado en su totalidad.\n\nActualmente se encuentra en proceso o pendiente de entrega 🙌" } });
        } else {
          await enviar(from, saldoUnPedido(pedidos[0]));
        }
      } else {
        await enviar(from, seleccionarPedidoSaldo(pedidos));
      }
      return res.sendStatus(200);
    }

    if (input === "ABONAR") { await enviar(from, infoMediosPago()); return res.sendStatus(200); }
    if (input === "GARANTIA") { await enviar(from, { text: { body: "🛡️ *GARANTÍA MUEBLES NICO*\n\nTodos nuestros trabajos cuentan con *1 año de garantía*.\n\n*La garantía cubre:*\n\n• Defectos de fábrica en el material\n• Problemas de instalación realizados por nosotros\n\n*La garantía no cubre:*\n\n• Humedad\n• Golpes o mal uso\n• Intervenciones de terceros\n\n🤝 Si llegas a tener algún inconveniente, con gusto lo revisamos y te damos solución de la manera más rápida posible." } }); return res.sendStatus(200); }
    if (input === "TIEMPOS") { await enviar(from, { text: { body: "⏳ Sobre los tiempos de entrega\n\nEl tiempo estimado de fabricación y entrega es de *hasta 15 días habiles* desde la confirmación del anticipo.\n\nEste tiempo puede variar según el tipo de trabajo y la carga del taller, y en muchos casos el pedido puede estar listo antes.\n\nCuando tu pedido esté terminado, te contactaremos para coordinar la entrega o instalación.😊\n\nGracias por confiar en *Muebles Nico* 🙌" } }); return res.sendStatus(200); }
    if (input === "ASESOR") { await enviar(from, { text: { body: "📞 Un asesor te contactará pronto." } }); return res.sendStatus(200); }

    if (typeof input === "string" && (input.startsWith("SALDO_") || input.startsWith("PEDIDO_"))) {
      const isSaldo = input.startsWith("SALDO_");
      const id = input.replace(isSaldo ? "SALDO_" : "PEDIDO_", "").trim();
      const pds = isSaldo ? await consultarSaldo(from) : await getPedidosByPhone(from);
      const pedido = Array.isArray(pds) ? pds.find(p => String(p.id) === id) : null;
      if (pedido) {
        if (isSaldo) {
          Number(pedido.saldo) === 0 ? await enviar(from, { text: { body: "💚 Este pedido ya fue pagado." } }) : await enviar(from, saldoUnPedido(pedido));
        } else {
          pedido.estado_pedido === "ENTREGADO" ? await enviar(from, { text: { body: "✅ Este pedido ya fue entregado." } }) : await enviar(from, estadoPedidoTemplate(pedido));
        }
      }
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en HandleMessage:", err);
    if (!res.headersSent) res.sendStatus(500);
  }
};