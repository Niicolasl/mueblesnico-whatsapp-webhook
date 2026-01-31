import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState,
} from "../flows/newOrderFlow.js";

// 🛡️ Imports para Chatwoot y Clientes
import { getOrCreateClient } from "../db/clients.js";
import {
  forwardToChatwoot,
  sincronizarEtiquetasCliente,
  actualizarAtributosCliente
} from "../services/chatwootService.js";

// ⏱️ Timers de cotización (por cliente)
global.cotizacionTimers = global.cotizacionTimers || {};
global.estadoCotizacion = global.estadoCotizacion || {};
global.estadoCliente = global.estadoCliente || {};

import { formatOrderInline, formatOrderHeader } from "../utils/orderFormatter.js";
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
// 🔧 Helper de envío
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

// =====================================================
// ⏱️ Mensaje diferido al final de cotización
// =====================================================
const programarMensajeAsesor = async (from) => {
  if (global.cotizacionTimers[from]) {
    clearTimeout(global.cotizacionTimers[from]);
  }

  global.cotizacionTimers[from] = setTimeout(async () => {
    await enviar(from, {
      text: {
        body:
          "¡Gracias por la información! 😊" +
          "Ya tenemos todo lo necesario para continuar con tu cotización. " +
          "Apenas esté disponible, me comunicare contigo para darte el valor y resolver cualquier duda.",
      },
    });

    delete global.cotizacionTimers[from];
  }, 13 * 1000);
};

// =====================================================
// 🔔 NOTIFICAR CAMBIO DE ESTADO AL CLIENTE
// =====================================================
async function notificarCambioEstado(pedido, enviar) {
  if (
    !pedido ||
    !pedido.estado_pedido ||
    !pedido.order_code ||
    !pedido.numero_whatsapp
  ) {
    console.error(
      "❌ notificarCambioEstado recibió un pedido inválido:",
      pedido
    );
    return;
  }

  let mensaje = null;
  const estado = pedido.estado_pedido.toUpperCase();
  const saludoHora = obtenerSaludoColombia();

  if (estado === "LISTO") {
    mensaje =
      `Hola, ${saludoHora} 😊\n\n` +
      `Tu pedido ya está listo 🎉\n\n` +
      `📦 Pedido: ${pedido.order_code}\n` +
      `🛠️ Trabajo: ${pedido.descripcion_trabajo}\n\n` +
      `Cuando quieras, escríbeme y coordinamos la entrega.`;
  }

  if (estado === "ENTREGADO") {
    mensaje =
      `Hola 🙌\n\n` +
      `Tu pedido fue entregado con éxito ✅\n\n` +
      `📦 ${formatOrderInline(pedido.order_code, pedido.descripcion_trabajo)}\n\n` +
      `Gracias por confiar en *Muebles Nico* 🙏\n\n` +
      `¿Qué te pareció tu experiencia con nosotros?\n` +
      `Si quieres compartir tu opinión, escríbenos. ` +
      `Nos ayuda mucho a mejorar 😊`;
  }

  if (!mensaje) return;

  await enviar(pedido.numero_whatsapp, {
    text: { body: mensaje },
  });
}

// =====================================================
// 📲 HANDLER PRINCIPAL (WhatsApp + Chatwoot)
// =====================================================

export const handleMessage = async (req, res) => {
  try {
    // 🛑 CORTE DE BUCLE: Si no viene de WhatsApp, ignoramos
    if (!req.body?.entry) {
      return res?.sendStatus(200);
    }

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const contact = changes?.value?.contacts?.[0];
    const profileName = contact?.profile?.name || null;

    if (!message) return res.sendStatus(200);

    const from = normalizarTelefono(message.from);

    // 👤 Sincronizar con base de datos de clientes
    const client = await getOrCreateClient(from, profileName);

    // ✋ Cancelar timer si cliente sigue en flujo de cotización
    if (global.estadoCotizacion?.[from] && global.cotizacionTimers?.[from]) {
      clearTimeout(global.cotizacionTimers[from]);
      delete global.cotizacionTimers[from];
    }

    let text = message.text?.body?.trim() || "";
    let interactiveId = null;

    if (message.interactive?.list_reply) {
      interactiveId = message.interactive.list_reply.id;
    }
    if (message.interactive?.button_reply) {
      interactiveId = message.interactive.button_reply.id;
    }

    let input = interactiveId ?? text;
    let inputLower = typeof input === "string" ? input.toLowerCase() : "";
    let forceCotizar = false;

    console.log("📩 INPUT:", input, "FROM:", from);

    // 🛡️ Sincronizar mensaje entrante con Chatwoot
    try {
      await forwardToChatwoot(from, client.name, message);
    } catch (err) {
      console.error("⚠️ Error Chatwoot:", err?.message);
    }

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
      "holaa", "buenass", "saludos"
    ];

    const esSaludo = saludos.some(
      (saludo) => inputLower === saludo || inputLower.startsWith(saludo)
    );

    if (esSaludo && !global.estadoCotizacion?.[from] && !adminState[from]) {
      const saludoHora = obtenerSaludoColombia();

      await enviar(from, {
        text: {
          body: `Hola, ${saludoHora} 😊\nEspero que estés muy bien.`,
        },
      });

      if (!forceCotizar) {
        await enviar(from, {
          text: {
            body:
              "Escribe *Menú* en el momento que desees para ver todas las opciones, o si prefieres dime qué necesitas y con gusto te ayudo.",
          },
        });
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 🟩 ENTRADA FORZADA AL FLUJO DE COTIZACIÓN
    // =====================================================
    if (forceCotizar) {
      input = "COTIZAR";
    }

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
      delete global.estadoCotizacion[from];
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
          body: "📌 Ingresa el *código del pedido* a cancelar",
        },
      });

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
        await enviar(from, {
          text: { body: "⛔ Este pedido ya está cancelado." },
        });
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
            `📦 Pedido: ${pedido.order_code}\n` +
            `🛠️ Trabajo: ${pedido.descripcion_trabajo}\n\n` +
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
          await enviar(from, {
            text: { body: "❌ Ocurrió un error al cancelar el pedido." },
          });
          delete adminState[from];
          return res.sendStatus(200);
        }

        await enviar(from, {
          text: {
            body:
              "❌ *Pedido cancelado correctamente*\n\n" +
              `📦 Pedido: ${pedido.order_code}\n` +
              `🛠️ Trabajo: ${pedido.descripcion_trabajo}`,
          },
        });

        // ✅ Avisar al CLIENTE automáticamente
        if (result.numero_whatsapp) {
          const saludoHora = obtenerSaludoColombia();
          await enviar(result.numero_whatsapp, {
            text: {
              body:
                `Hola, ${saludoHora} 😊\n\n` +
                `Queremos informarte que tu pedido ha sido cancelado.\n\n` +
                `📦 Pedido: ${result.order_code}\n` +
                `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n` +
                "Si tienes alguna duda o deseas retomarlo, escríbenos y con gusto te ayudamos 🤝",
            },
          });

          // 🏷️ SINCRONIZAR CHATWOOT
          try {
            await sincronizarEtiquetasCliente(result.numero_whatsapp);
            await actualizarAtributosCliente(result.numero_whatsapp);
          } catch (err) {
            console.error("⚠️ Error sincronizando Chatwoot:", err.message);
          }
        }

        delete adminState[from];
        return res.sendStatus(200);
      }

      // ❌ NO
      await enviar(from, {
        text: { body: "❎ Cancelación abortada." },
      });

      delete adminState[from];
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: CAMBIO DE ESTADO MANUAL (CON CONFIRMACIÓN)
    // =====================================================
    const comandosEstado = {
      "/listo": "LISTO",
      "/entregado": "ENTREGADO",
    };

    if (esAdmin && comandosEstado[inputLower]) {
      adminState[from] = {
        step: "estado_codigo",
        nuevoEstado: comandosEstado[inputLower],
      };

      await enviar(from, {
        text: { body: "📌 Ingresa el *código del pedido*" },
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
          text: { body: "⛔ Este pedido está CANCELADO y no admite cambios." },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "FINALIZADO" && nuevoEstado !== "ENTREGADO") {
        await enviar(from, {
          text: {
            body:
              "⚠️ Este pedido ya fue finalizado.\n\n" +
              "No se puede cambiar su estado.",
          },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const pedido = validacion.pedido;

      // 🔥 GUARDAR PEDIDO Y CAMBIAR A CONFIRMACIÓN
      adminState[from].pedido = pedido;
      adminState[from].step = "confirmar_estado";

      const estadoTexto = nuevoEstado === "LISTO"
        ? "✅ LISTO para entrega"
        : "✅ ENTREGADO";

      await enviar(from, {
        text: {
          body:
            "⚠️ *Confirma el cambio de estado*\n\n" +
            `📦 Pedido: ${pedido.order_code}\n` +
            `🛠️ Trabajo: ${pedido.descripcion_trabajo}\n` +
            `👤 Cliente: ${pedido.nombre_cliente}\n\n` +
            `${estadoTexto}\n\n` +
            "Escribe *SI* para confirmar\n" +
            "Escribe *NO* para cancelar"
        }
      });

      return res.sendStatus(200);
    }

    // 🔥 NUEVO PASO: CONFIRMAR CAMBIO DE ESTADO
    if (esAdmin && adminState[from]?.step === "confirmar_estado") {
      const respuesta = inputLower;

      if (respuesta !== "si") {
        await enviar(from, {
          text: { body: "❎ Cambio de estado cancelado." }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const pedido = adminState[from].pedido;
      const nuevoEstado = adminState[from].nuevoEstado;

      // ✅ ACTUALIZAR ESTADO
      const pedidoActualizado = await actualizarEstadoPedido(pedido.order_code, nuevoEstado);

      if (!pedidoActualizado) {
        await enviar(from, {
          text: {
            body:
              "❌ No se pudo actualizar el estado del pedido.\n\n" +
              "Verifica que no esté cancelado.",
          },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      delete adminState[from];

      // ✅ CONFIRMACIÓN AL ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Estado actualizado*\n\n` +
            `📦 Pedido: ${pedidoActualizado.order_code}\n` +
            `🛠️ Trabajo: ${pedidoActualizado.descripcion_trabajo}\n` +
            `📌 Nuevo estado: ${nuevoEstado.replace("_", " ")}`,
        },
      });

      // 📩 NOTIFICAR AL CLIENTE
      await notificarCambioEstado(pedidoActualizado, enviar);

      // 🏷️ SINCRONIZAR CHATWOOT
      try {
        await sincronizarEtiquetasCliente(pedidoActualizado.numero_whatsapp);
        await actualizarAtributosCliente(pedidoActualizado.numero_whatsapp);
      } catch (err) {
        console.error("⚠️ Error sincronizando Chatwoot:", err.message);
      }

      delete adminState[from];

      // ✅ CONFIRMACIÓN ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Estado actualizado*\n\n` +
            `📦 Pedido: ${pedido.order_code}\n` +
            `🛠️ Trabajo: ${pedido.descripcion_trabajo}\n` +
            `📌 Nuevo estado: ${nuevoEstado.replace("_", " ")}`,
        },
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: ANTICIPO CON CONFIRMACIÓN
    // =====================================================
    if (esAdmin && inputLower === "/abono") {
      adminState[from] = { step: "anticipo_codigo" };

      await enviar(from, {
        text: {
          body: "📌 Ingresa el *código del pedido*",
        },
      });

      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "anticipo_codigo") {
      const codigo = input.toUpperCase();

      const validacion = await obtenerPedidoActivo(codigo);

      if (validacion.error === "NO_EXISTE") {
        await enviar(from, {
          text: { body: "❌ El pedido no existe." },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "CANCELADO") {
        await enviar(from, {
          text: { body: "❌ Este pedido está CANCELADO y no admite cambios." },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const pedido = validacion.pedido;

      if (Number(pedido.saldo_pendiente) <= 0) {
        await enviar(from, {
          text: {
            body:
              "✅ Este pedido ya se encuentra *completamente pagado*.\n\n" +
              "No es posible registrar más anticipos.",
          },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      adminState[from].orderCode = codigo;
      adminState[from].pedido = pedido;
      adminState[from].step = "anticipo_valor";

      await enviar(from, {
        text: {
          body:
            `💵 Ingresa el *valor abonado*\n\n` +
            `Saldo pendiente: $${Number(pedido.saldo_pendiente).toLocaleString()}`,
        },
      });

      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "anticipo_valor") {
      const base = Number(input.replace(/[^\d]/g, ""));
      const valor = base * 1000;

      if (!valor || valor <= 0) {
        await enviar(from, {
          text: {
            body: "❌ Valor inválido. Ingresa solo números.",
          },
        });
        return res.sendStatus(200);
      }

      const pedido = adminState[from].pedido;
      const nuevoSaldo = Number(pedido.saldo_pendiente) - valor;

      if (nuevoSaldo < 0) {
        await enviar(from, {
          text: {
            body:
              `❌ El valor ingresado excede el saldo pendiente.\n\n` +
              `Saldo actual: $${Number(pedido.saldo_pendiente).toLocaleString()}`,
          },
        });
        return res.sendStatus(200);
      }

      adminState[from].valor = valor;
      adminState[from].step = "confirmar_abono";

      await enviar(from, {
        text: {
          body:
            "⚠️ *Confirma el abono*\n\n" +
            `📦 Pedido: ${pedido.order_code}\n` +
            `🛠️ Trabajo: ${pedido.descripcion_trabajo}\n` +
            `💰 Valor a abonar: $${valor.toLocaleString()}\n` +
            `📊 Nuevo saldo: $${nuevoSaldo.toLocaleString()}\n\n` +
            "Escribe *SI* para confirmar\n" +
            "Escribe *NO* para cancelar"
        }
      });

      return res.sendStatus(200);
    }

    if (esAdmin && adminState[from]?.step === "confirmar_abono") {
      const respuesta = inputLower;

      if (respuesta !== "si") {
        await enviar(from, {
          text: { body: "❎ Registro de abono cancelado." }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const result = await registrarAnticipo(
        adminState[from].orderCode,
        adminState[from].valor
      );

      if (result?.error === "EXCEDE_SALDO") {
        await enviar(from, {
          text: {
            body:
              `❌ El valor ingresado excede el saldo pendiente.\n\n` +
              `Saldo actual: $${Number(result.saldo).toLocaleString()}`,
          },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (result?.error === "PAGADO") {
        await enviar(from, {
          text: {
            body: "✅ Este pedido ya se encuentra completamente pagado.",
          },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (!result) {
        await enviar(from, {
          text: {
            body: "❌ No se pudo registrar el anticipo. Verifica el código.",
          },
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      const valor = adminState[from].valor;
      delete adminState[from];

      // ✅ Mensaje al ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Anticipo registrado*\n\n` +
            `📦 Pedido: ${result.order_code}\n` +
            `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n` +
            `Abonado total: $${Number(result.valor_abonado).toLocaleString()}\n` +
            `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}`,
        },
      });

      // ✅ Mensaje al CLIENTE
      let mensajeCliente;
      // Guardamos el saldo en una variable para usarla varias veces
      const saldoPendiente = Number(result.saldo_pendiente);

      if (saldoPendiente <= 0) {
        // Caso: Pago TOTAL
        mensajeCliente =
          `🎉 *¡Pago completado!*\n\n` +
          `Tu pedido ya está completamente pagado:\n` +
          `📦 ${formatOrderInline(result.order_code, result.descripcion_trabajo)}\n\n` +
          `¡Gracias por confiar en Muebles Nico!`;
      } else {
        // Caso: Abono parcial
        mensajeCliente =
          `💳 *Hemos recibido tu abono*\n\n` +
          formatOrderHeader(result.order_code, result.descripcion_trabajo, result.valor_total) +
          `\n\n` +
          `Abono recibido: $${valor.toLocaleString()}\n` +
          `Saldo pendiente: $${saldoPendiente.toLocaleString()}\n\n` +
          `Gracias por tu pago 🙌`;
      }

      // 1. Enviamos el recibo (se envía siempre)
      await enviar(result.numero_whatsapp, {
        text: { body: mensajeCliente },
      });

      // 2. Enviamos el mensaje del menú SOLO si hay deuda pendiente
      if (saldoPendiente > 0) {
        await enviar(result.numero_whatsapp, {
          text: { body: `Puedes escribir *menú* para ver el estado y saldo de tus pedidos` },
        });
      }

      // 🏷️ SINCRONIZAR CHATWOOT
      try {
        await sincronizarEtiquetasCliente(result.numero_whatsapp);
        await actualizarAtributosCliente(result.numero_whatsapp);
      } catch (err) {
        console.error("⚠️ Error sincronizando Chatwoot:", err.message);
      }

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟦 CLIENTE: OPCIONES MENÚ
    // =====================================================
    if (global.cotizacionTimers?.[from]) {
      clearTimeout(global.cotizacionTimers[from]);
      delete global.cotizacionTimers[from];
    }

    if (input === "COTIZAR") {
      global.estadoCotizacion = global.estadoCotizacion || {};
      global.estadoCotizacion[from] = { step: "tipoTrabajo" };

      await enviar(from, {
        text: {
          body:
            "🪑 *Ten en cuenta qué*\n\n" +
            "Para los muebles que requieren *tapicería*:\n" +
            "• Se cobra únicamente la *mano de obra*.\n" +
            "• Los materiales los adquiere el cliente, ya que su precio varía según diseño y calidad.(yo te indico cuales serian)\n\n" +
            "Fabricamos y también *restauramos* muebles.\n\n",
        },
      });

      await enviar(from, {
        text: {
          body:
            "¿Qué es lo que necesitas hacer? 👇\n\n" +
            "1️⃣ Fabricar un mueble nuevo\n" +
            "2️⃣ Restaurar o tapizar un mueble\n" +
            "3️⃣ Otro arreglo (reparaciones, rieles, chapas, instalación, etc.)\n\n" +
            "Respóndeme con el número o escríbelo con tus propias palabras.",
        },
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🧠 RESPUESTAS DEL FLUJO DE COTIZACIÓN
    // =====================================================
    if (global.estadoCotizacion?.[from]) {
      const estadoCot = global.estadoCotizacion[from];

      if (estadoCot.step === "tipoTrabajo") {
        const textLower = inputLower;

        if (["1", "fabricar", "nuevo"].some((x) => textLower.includes(x))) {
          await enviar(from, {
            text: {
              body:
                "🔹 *Fabricar mueble nuevo*\n\n" +
                "Cuéntame qué mueble tienes en mente 😊\n" +
                "Puedes enviarme:\n" +
                "• Fotos o referencias\n" +
                "• Medidas aproximadas\n\n" +
                "Si no estás segur@, también podemos asesorarte.",
            },
          });

          estadoCot.step = "detalleTrabajo";
          estadoCot.tipo = "fabricar";
          return res.sendStatus(200);
        }

        if (["2", "restaurar", "tapizar"].some((x) => textLower.includes(x))) {
          await enviar(from, {
            text: {
              body:
                "🔹 *Restaurar o tapizar*\n\n" +
                "Envíame por favor:\n" +
                "• Fotos actuales del mueble\n" +
                "• Qué te gustaría cambiar o mejorar",
            },
          });

          estadoCot.step = "detalleTrabajo";
          estadoCot.tipo = "restaurar";
          return res.sendStatus(200);
        }

        await enviar(from, {
          text: {
            body:
              "🔹 *Otro arreglo*\n\n" +
              "Cuéntame qué necesitas hacer y, si es posible,\n" +
              "envíame una foto del área o mueble.",
          },
        });

        estadoCot.step = "detalleTrabajo";
        estadoCot.tipo = "otro";
        return res.sendStatus(200);
      }

      if (estadoCot.step === "detalleTrabajo") {
        programarMensajeAsesor(from);
        delete global.estadoCotizacion[from];
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 📦 CLIENTE: ESTADO DE PEDIDO
    // =====================================================
    if (input === "PEDIDO") {
      const pedidos = await getPedidosByPhone(from);

      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, {
          text: {
            body: "📭 No encontramos pedidos activos asociados a este número.",
          },
        });
        return res.sendStatus(200);
      }

      if (pedidos.length === 1) {
        const pedido = pedidos[0];

        if (pedido.estado_pedido === "ENTREGADO") {
          await enviar(from, {
            text: {
              body:
                "✅ Este pedido ya fue entregado 🙌\n\n" +
                "Si necesitas algo más o tienes alguna duda, escríbeme con confianza 😊",
            },
          });
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

      if (pedidos?.error || !Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, {
          text: {
            body: "📭 No encontramos pedidos activos asociados a este número.",
          },
        });
        return res.sendStatus(200);
      }

      if (pedidos.length === 1) {
        const pedido = pedidos[0];

        if (Number(pedido.saldo) === 0) {
          await enviar(from, {
            text: {
              body:
                "💚 Este pedido ya fue pagado en su totalidad.\n\n" +
                "Actualmente se encuentra en proceso o pendiente de entrega 🙌",
            },
          });
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

    if (input === "GARANTIA") {
      await enviar(from, {
        text: {
          body:
            "🛡️ *GARANTÍA MUEBLES NICO*\n\n" +
            "Todos nuestros trabajos cuentan con *1 año de garantía*.\n\n" +
            "*La garantía cubre:*\n\n" +
            "• Defectos de fábrica en el material\n" +
            "• Problemas de instalación realizados por nosotros\n\n" +
            "*La garantía no cubre:*\n\n" +
            "• Humedad\n" +
            "• Golpes o mal uso\n" +
            "• Intervenciones de terceros\n\n" +
            "🤝 Si llegas a tener algún inconveniente, con gusto lo revisamos y te damos solución de la manera más rápida posible.",
        },
      });
      return res.sendStatus(200);
    }

    if (input === "TIEMPOS") {
      await enviar(from, {
        text: {
          body:
            "⏳ Sobre los tiempos de entrega\n\n" +
            "El tiempo estimado de fabricación y entrega es de *hasta 15 días habiles* desde la confirmación del anticipo.\n\n" +
            "Este tiempo puede variar según el tipo de trabajo y la carga del taller, y en muchos casos el pedido puede estar listo antes.\n\n" +
            "Cuando tu pedido esté terminado, te contactaremos para coordinar la entrega o instalación.😊\n\n" +
            "Gracias por confiar en *Muebles Nico* 🙌",
        },
      });
      return res.sendStatus(200);
    }

    if (input === "ASESOR") {
      await enviar(from, {
        text: { body: "📞 Un asesor te contactará pronto." },
      });
      return res.sendStatus(200);
    }

    // =====================================================
    // 💰 CLIENTE: SELECCIÓN DE PEDIDO DESDE SALDO
    // =====================================================
    if (typeof input === "string" && input.startsWith("SALDO_")) {
      const id = input.replace("SALDO_", "").trim();

      if (!/^\d+$/.test(id)) return res.sendStatus(200);

      const pedidos = await consultarSaldo(from);

      if (!Array.isArray(pedidos)) {
        await enviar(from, {
          text: { body: "❌ No pudimos obtener la información del pedido." },
        });
        return res.sendStatus(200);
      }

      const pedido = pedidos.find((p) => String(p.id) === id);

      if (!pedido) {
        await enviar(from, {
          text: {
            body: "❌ Pedido no encontrado o no pertenece a este número.",
          },
        });
        return res.sendStatus(200);
      }

      if (Number(pedido.saldo) === 0) {
        await enviar(from, {
          text: {
            body:
              "💚 Este pedido ya fue pagado en su totalidad.\n\n" +
              "Actualmente se encuentra en proceso o pendiente de entrega 🙌",
          },
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

      if (!/^\d+$/.test(id)) return res.sendStatus(200);

      const pedidos = await getPedidosByPhone(from);

      if (!Array.isArray(pedidos)) {
        await enviar(from, {
          text: { body: "❌ No pudimos obtener la información del pedido." },
        });
        return res.sendStatus(200);
      }

      const pedido = pedidos.find((p) => String(p.id) === id);

      if (!pedido) {
        await enviar(from, {
          text: {
            body: "❌ Pedido no encontrado o no pertenece a este número.",
          },
        });
        return res.sendStatus(200);
      }

      if (pedido.estado_pedido === "ENTREGADO") {
        await enviar(from, {
          text: {
            body:
              "✅ Este pedido ya fue entregado 🙌\n\n" +
              "Si necesitas algo más o tienes alguna duda, escríbeme con confianza 😊",
          },
        });
        return res.sendStatus(200);
      }

      await enviar(from, estadoPedidoTemplate(pedido));
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en HandleMessage:", err);
    if (!res.headersSent) res.sendStatus(500);
  }
};