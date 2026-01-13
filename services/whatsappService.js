import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState,
} from "../flows/newOrderFlow.js";

// ⏱️ Timers de cotización (por cliente)
global.cotizacionTimers = global.cotizacionTimers || {};
global.estadoCotizacion = global.estadoCotizacion || {};

import { getOrCreateClient } from "../db/clients.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { registrarAnticipo } from "../db/anticipo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { obtenerPedidoActivo } from "../db/validarPedidoActivo.js";
import { actualizarEstadoPedido } from "../db/actualizarEstadoPedido.js";
import { getPedidosByPhone } from "../db/orders.js";
import { obtenerSaludoColombia } from "../utils/saludos.js";
import { forwardToChatwoot, sendBotMessageToChatwoot } from "../services/chatwootService.js";

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

// 🔧 Helper envío
const enviar = async (to, payload, logChatwoot = true) => {
  const toWhatsapp = telefonoParaWhatsApp(to);

  if (payload?.type === "interactive") {
    await sendMessage(toWhatsapp, {
      type: "interactive",
      interactive: payload.interactive,
    });
  } else {
    await sendMessage(toWhatsapp, payload);
  }

  // 🔹 Registrar mensaje en Chatwoot
  if (logChatwoot && payload?.text?.body) {
    try {
      await sendBotMessageToChatwoot(toWhatsapp, payload.text.body);
    } catch (err) {
      console.error("⚠️ Error registrando mensaje BOT en Chatwoot:", err.message || err);
    }
  }
};

// ⏱️ Mensaje diferido al final de cotización
const programarMensajeAsesor = async (from) => {
  if (global.cotizacionTimers[from]) {
    clearTimeout(global.cotizacionTimers[from]);
  }

  global.cotizacionTimers[from] = setTimeout(async () => {
    const body =
      "¡Gracias por la información! 😊" +
      "Ya tenemos todo lo necesario para continuar con tu cotización. " +
      "Apenas esté disponible, me comunicare contigo para darte el valor y resolver cualquier duda.";

    await enviar(from, { text: { body } });
    delete global.cotizacionTimers[from];
  }, 13 * 1000);
};

// =====================================================
// 📲 HANDLER PRINCIPAL
// =====================================================

export const handleMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const contact = changes?.value?.contacts?.[0];
    const profileName = contact?.profile?.name || null;

    if (!message) return res.sendStatus(200);

    const from = normalizarTelefono(message.from);
    const fromE164 = telefonoParaWhatsApp(from);

    let text = message.text?.body?.trim() || "";
    const client = await getOrCreateClient(from, profileName);

    // 🛡️ Registrar mensaje del cliente en Chatwoot
    if (text) {
      try {
        await forwardToChatwoot(fromE164, client.name, text);
      } catch (err) {
        console.error("⚠️ Chatwoot falló pero el bot sigue:", err?.message || err);
      }
    }

    // ✋ Cancelar timers de cotización si hay
    if (global.estadoCotizacion?.[from] && global.cotizacionTimers?.[from]) {
      clearTimeout(global.cotizacionTimers[from]);
      delete global.cotizacionTimers[from];
    }

    let interactiveId = null;
    if (message.interactive?.list_reply) interactiveId = message.interactive.list_reply.id;
    if (message.interactive?.button_reply) interactiveId = message.interactive.button_reply.id;

    let input = interactiveId ?? text;
    let inputLower = typeof input === "string" ? input.toLowerCase() : "";
    let forceCotizar = false;

    console.log("📩 INPUT:", input, "FROM:", from);

    if (!global.estadoCliente) global.estadoCliente = {};
    const estado = global.estadoCliente;

    const esAdmin = ADMINS.includes(from);

    // =====================================================
    // 🧠 DETECCIÓN PRIORITARIA DE "COTIZAR"
    // =====================================================
    if (
      !global.estadoCotizacion?.[from] &&
      !adminState[from] &&
      /\bcotizar\b/.test(inputLower)
    ) {
      forceCotizar = true;
    }

    // =====================================================
    // 👋 SALUDOS NATURALES
    // =====================================================
    const saludos = [
      "hola", "holi", "hla", "buenas", "buen día", "buen dia",
      "buenos días", "buenos dias", "buenas tardes", "buenas noches",
      "holaa", "buenass", "saludos",
    ];

    const esSaludo = saludos.some(
      (saludo) => inputLower === saludo || inputLower.startsWith(saludo)
    );

    if (esSaludo && !global.estadoCotizacion?.[from] && !adminState[from]) {
      const saludoHora = obtenerSaludoColombia();

      await enviar(from, { text: { body: `Hola, ${saludoHora} 😊\nEspero que estés muy bien.` } });

      if (!forceCotizar) {
        await enviar(from, { text: { body: "Escribe *Menú* en el momento que desees para ver todas las opciones, o si prefieres dime qué necesitas y con gusto te ayudo." } });
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 🟩 ENTRADA FORZADA AL FLUJO DE COTIZACIÓN
    // =====================================================
    if (forceCotizar) input = "COTIZAR";

    // =====================================================
    // 🟪 SALDO (esperando dato)
    // =====================================================
    if (estado[from] === "esperando_dato_saldo") {
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
      await enviar(from, { text: { body: "📌 Ingresa el *código del pedido* a cancelar" } });
      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "cancelar_codigo") {
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

      adminState[from] = {
        step: "confirmar_cancelacion",
        pedido: validacion.pedido,
      };

      const pedido = validacion.pedido;
      await enviar(from, {
        text: {
          body:
            "⚠️ *Confirma la cancelación*\n\n" +
            `Pedido: *${pedido.order_code}*\n` +
            `Trabajo: ${pedido.descripcion_trabajo}\n\n` +
            "Escribe *SI* para confirmar o *NO* para cancelar la acción.",
        },
      });
      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "confirmar_cancelacion") {
      const respuesta = inputLower;
      const pedido = adminState[from].pedido;

      if (respuesta === "si") {
        const result = await cancelarPedido(pedido.order_code);

        if (result === "error") {
          await enviar(from, { text: { body: "❌ Ocurrió un error al cancelar el pedido." } });
          delete adminState[from];
          return res.sendStatus(200);
        }

        await enviar(from, {
          text: {
            body:
              "❌ *Pedido cancelado correctamente*\n\n" +
              `Pedido: ${pedido.order_code}\n` +
              `Trabajo: ${pedido.descripcion_trabajo}`,
          },
        });

        // Avisar al CLIENTE automáticamente
        if (result.numero_whatsapp) {
          const saludoHora = obtenerSaludoColombia();
          await enviar(result.numero_whatsapp, {
            text: {
              body:
                `Hola, ${saludoHora} 😊\n\n` +
                `Queremos informarte que tu pedido *${result.order_code}* ha sido cancelado.\n\n` +
                (result.descripcion_trabajo ? `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n` : "") +
                "Si tienes alguna duda o deseas retomarlo, escríbenos y con gusto te ayudamos 🤝",
            },
          });
        }

        delete adminState[from];
        return res.sendStatus(200);
      }

      await enviar(from, { text: { body: "❎ Cancelación abortada." } });
      delete adminState[from];
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: CAMBIO DE ESTADO MANUAL
    // =====================================================
    const comandosEstado = { "/listo": "LISTO", "/entregado": "ENTREGADO" };

    if (esAdmin && comandosEstado[inputLower]) {
      adminState[from] = { step: "estado_codigo", nuevoEstado: comandosEstado[inputLower] };
      await enviar(from, { text: { body: "📌 Ingresa el *código del pedido*" } });
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
        await enviar(from, { text: { body: "⛔ Este pedido está CANCELADO y no admite cambios." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "FINALIZADO" && nuevoEstado !== "ENTREGADO") {
        await enviar(from, { text: { body: "⚠️ Este pedido ya fue finalizado.\nNo se puede cambiar su estado." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const pedido = await actualizarEstadoPedido(orderCode, nuevoEstado);
      if (!pedido) {
        await enviar(from, { text: { body: "❌ No se pudo actualizar el estado del pedido.\nVerifica que no esté cancelado." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      // Notificar cliente
      async function notificarCambioEstado(pedido, enviar) {
        if (!pedido || !pedido.estado_pedido || !pedido.order_code || !pedido.numero_whatsapp) return;

        const estado = pedido.estado_pedido.toUpperCase();
        const saludoHora = obtenerSaludoColombia();
        let mensaje = null;

        if (estado === "LISTO") {
          mensaje = `Hola, ${saludoHora} 😊\n\nTu pedido *${pedido.order_code}* ya está listo 🎉\nCuando quieras, escríbeme y coordinamos la entrega.`;
        }
        if (estado === "ENTREGADO") {
          mensaje = `Hola 🙌\n\nQuería avisarte que tu pedido *${pedido.order_code}* ya fue entregado con éxito ✅\nGracias por confiar en nosotros.`;
        }

        if (mensaje) await enviar(pedido.numero_whatsapp, { text: { body: mensaje } });
      }

      await notificarCambioEstado(pedido, enviar);
      delete adminState[from];

      await enviar(from, { text: { body: `✅ *Estado actualizado*\n\nPedido: ${pedido.order_code}\nNuevo estado: ${nuevoEstado.replace("_", " ")}` } });
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: ANTICIPO / ABONO
    // =====================================================
    if (esAdmin && inputLower === "/abono") {
      adminState[from] = { step: "anticipo_codigo" };
      await enviar(from, { text: { body: "📌 Ingresa el *código del pedido*" } });
      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "anticipo_codigo") {
      const codigo = input.toUpperCase();
      const validacion = await obtenerPedidoActivo(codigo);

      if (validacion.error === "NO_EXISTE") {
        await enviar(from, { text: { body: "❌ El pedido no existe." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "CANCELADO") {
        await enviar(from, { text: { body: "❌ Este pedido está CANCELADO y no admite cambios." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const pedido = validacion.pedido;
      if (Number(pedido.saldo_pendiente) <= 0) {
        await enviar(from, { text: { body: "✅ Este pedido ya se encuentra *completamente pagado*.\nNo es posible registrar más anticipos." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      adminState[from].orderCode = codigo;
      adminState[from].step = "anticipo_valor";

      await enviar(from, { text: { body: `💵 Ingresa el *valor abonado*\nSaldo pendiente: $${Number(pedido.saldo_pendiente).toLocaleString()}` } });
      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "anticipo_valor") {
      const base = Number(input.replace(/[^\d]/g, ""));
      const valor = base * 1000;

      if (!valor || valor <= 0) {
        await enviar(from, { text: { body: "❌ Valor inválido. Ingresa solo números." } });
        return res.sendStatus(200);
      }

      const result = await registrarAnticipo(adminState[from].orderCode, valor);

      if (result?.error === "EXCEDE_SALDO") {
        await enviar(from, { text: { body: `❌ El valor ingresado excede el saldo pendiente.\nSaldo actual: $${Number(result.saldo).toLocaleString()}` } });
        return res.sendStatus(200);
      }

      if (result?.error === "PAGADO") {
        await enviar(from, { text: { body: "✅ Este pedido ya se encuentra completamente pagado." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (!result) {
        await enviar(from, { text: { body: "❌ No se pudo registrar el anticipo. Verifica el código." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      delete adminState[from];

      // ✅ Mensaje al ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Anticipo registrado*\n\nPedido: ${result.order_code}\nAbonado total: $${Number(result.valor_abonado).toLocaleString()}\nSaldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}`
        }
      });

      // ✅ Mensaje al CLIENTE
      let mensajeCliente = `💳 *Hemos recibido tu abono*\n\nPedido: ${result.order_code}\nAbono recibido: $${valor.toLocaleString()}\nSaldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}\n\nGracias por tu pago 🙌`;
      if (Number(result.saldo_pendiente) <= 0) {
        mensajeCliente = `🎉 *¡Pago completado!*\n\nTu pedido *${result.order_code}* ya se encuentra completamente pagado.\n¡Gracias por confiar en Muebles Nico!`;
      }

      await enviar(result.numero_whatsapp, { text: { body: mensajeCliente } });
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟦 CLIENTE: FLUJO COTIZACIÓN
    // =====================================================
    if (input === "COTIZAR") {
      global.estadoCotizacion = global.estadoCotizacion || {};
      global.estadoCotizacion[from] = { step: "tipoTrabajo" };

      // Mensaje inicial
      await enviar(from, {
        text: {
          body:
            "🪑 *Ten en cuenta qué*\n\nPara los muebles que requieren *tapicería*:\n• Se cobra únicamente la *mano de obra*.\n• Los materiales los adquiere el cliente, ya que su precio varía según diseño y calidad.(yo te indico cuales serían)\n\nFabricamos y también *restauramos* muebles.\n\n"
        }
      });

      await enviar(from, {
        text: {
          body:
            "¿Qué es lo que necesitas hacer? 👇\n1️⃣ Fabricar un mueble nuevo\n2️⃣ Restaurar o tapizar un mueble\n3️⃣ Otro arreglo (reparaciones, rieles, chapas, instalación, etc.)\n\nRespóndeme con el número o escríbelo con tus propias palabras."
        }
      });

      return res.sendStatus(200);
    }

    if (global.estadoCotizacion?.[from]) {
      const estado = global.estadoCotizacion[from];

      if (estado.step === "tipoTrabajo") {
        const textLower = inputLower;
        if (["1", "fabricar", "nuevo"].some(x => textLower.includes(x))) {
          await enviar(from, {
            text: {
              body:
                "🔹 *Fabricar mueble nuevo*\nCuéntame qué mueble tienes en mente 😊\nPuedes enviarme:\n• Fotos o referencias\n• Medidas aproximadas\n\nSi no estás segur@, también podemos asesorarte."
            }
          });
          estado.step = "detalleTrabajo";
          estado.tipo = "fabricar";
          return res.sendStatus(200);
        }
        if (["2", "restaurar", "tapizar"].some(x => textLower.includes(x))) {
          await enviar(from, {
            text: {
              body:
                "🔹 *Restaurar o tapizar*\nEnvíame por favor:\n• Fotos actuales del mueble\n• Qué te gustaría cambiar o mejorar"
            }
          });
          estado.step = "detalleTrabajo";
          estado.tipo = "restaurar";
          return res.sendStatus(200);
        }

        await enviar(from, {
          text: {
            body:
              "🔹 *Otro arreglo*\nCuéntame qué necesitas hacer y, si es posible,\nenvíame una foto del área o mueble."
          }
        });
        estado.step = "detalleTrabajo";
        estado.tipo = "otro";
        return res.sendStatus(200);
      }

      if (estado.step === "detalleTrabajo") {
        programarMensajeAsesor(from);
        delete global.estadoCotizacion[from];
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 💰 CLIENTE: ESTADO DE PEDIDO
    // =====================================================
    if (input === "PEDIDO") {
      const pedidos = await getPedidosByPhone(from);
      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
        return res.sendStatus(200);
      }

      if (pedidos.length === 1) {
        const pedido = pedidos[0];
        if (pedido.estado_pedido === "ENTREGADO") {
          await enviar(from, { text: { body: "✅ Este pedido ya fue entregado 🙌\nSi necesitas algo más o tienes alguna duda, escríbeme con confianza 😊" } });
          return res.sendStatus(200);
        }
        await enviar(from, estadoPedidoTemplate(pedido));
        return res.sendStatus(200);
      }

      await enviar(from, seleccionarPedidoEstado(pedidos));
      return res.sendStatus(200);
    }

    // =====================================================
    // 💰 CLIENTE: SALDO
    // =====================================================
    if (input === "SALDO") {
      const pedidos = await consultarSaldo(from);
      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
        return res.sendStatus(200);
      }

      if (pedidos.length === 1) {
        const pedido = pedidos[0];
        if (Number(pedido.saldo) === 0) {
          await enviar(from, { text: { body: "💚 Este pedido ya fue pagado en su totalidad.\nActualmente se encuentra en proceso o pendiente de entrega 🙌" } });
          return res.sendStatus(200);
        }
        await enviar(from, saldoUnPedido(pedido));
        return res.sendStatus(200);
      }

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

    // =====================================================
    // 🛡 CLIENTE: GARANTÍA
    // =====================================================
    if (input === "GARANTIA") {
      await enviar(from, {
        text: {
          body:
            "🛡️ *GARANTÍA MUEBLES NICO*\n\nTodos nuestros trabajos cuentan con *1 año de garantía*.\n\n*La garantía cubre:*\n• Defectos de fábrica en el material\n• Problemas de instalación realizados por nosotros\n\n*La garantía no cubre:*\n• Humedad\n• Golpes o mal uso\n• Intervenciones de terceros\n\n🤝 Si llegas a tener algún inconveniente, con gusto lo revisamos y te damos solución de la manera más rápida posible."
        }
      });
      return res.sendStatus(200);
    }

    // =====================================================
    // ⏳ CLIENTE: TIEMPOS
    // =====================================================
    if (input === "TIEMPOS") {
      await enviar(from, {
        text: {
          body:
            "⏳ Sobre los tiempos de entrega\n\nEl tiempo estimado de fabricación y entrega es de *hasta 15 días hábiles* desde la confirmación del anticipo.\nEste tiempo puede variar según el tipo de trabajo y la carga del taller.\n\nCuando tu pedido esté terminado, te contactaremos para coordinar la entrega o instalación.😊\n\nGracias por confiar en *Muebles Nico* 🙌"
        }
      });
      return res.sendStatus(200);
    }

    // =====================================================
    // 📞 CLIENTE: SOLICITAR ASESOR
    // =====================================================
    if (input === "ASESOR") {
      await enviar(from, { text: { body: "📞 Un asesor te contactará pronto." } });
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err);
    return res.sendStatus(500);
  }
};
