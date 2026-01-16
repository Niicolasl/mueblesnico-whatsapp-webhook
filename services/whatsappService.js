import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState,
} from "../flows/newOrderFlow.js";

import { getOrCreateClient } from "../db/clients.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { registrarAnticipo } from "../db/anticipo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { obtenerPedidoActivo } from "../db/validarPedidoActivo.js";
import { actualizarEstadoPedido } from "../db/actualizarEstadoPedido.js";
import { getPedidosByPhone } from "../db/orders.js";
import { obtenerSaludoColombia } from "../utils/saludos.js";
import { forwardToChatwoot } from "../services/chatwootService.js";
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

// 🛡️ Configuración global
global.cotizacionTimers = global.cotizacionTimers || {};
global.estadoCotizacion = global.estadoCotizacion || {};
global.estadoCliente = global.estadoCliente || {};

const estadoCliente = global.estadoCliente;

const ADMINS = ["3204128555", "3125906313"];
const adminState = {};

// =====================================================
// 🔧 Helper de envío
// =====================================================
const enviar = async (to, payload) => {
  const toWhatsapp = telefonoParaWhatsApp(to);

  if (payload?.interactive) {
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
  if (global.cotizacionTimers[from])
    clearTimeout(global.cotizacionTimers[from]);

  global.cotizacionTimers[from] = setTimeout(async () => {
    await enviar(from, {
      text: {
        body:
          "¡Gracias por la información! 😊 Ya tenemos todo lo necesario para continuar con tu cotización. " +
          "Apenas esté disponible, me comunicaré contigo para darte el valor y resolver cualquier duda.",
      },
    });

    delete global.cotizacionTimers[from];
  }, 13 * 1000);
};

// =====================================================
// 📲 HANDLER PRINCIPAL (WhatsApp + Chatwoot)
// =====================================================
export const handleMessage = async (req, res = null) => {
  try {
    let message;
    let from;
    let profileName = null;

    // ===== Caso 1: viene de WhatsApp =====
    if (req.body?.entry) {
      const entry = req.body.entry[0];
      const changes = entry.changes[0];
      message = changes.value.messages?.[0];
      const contact = changes.value.contacts?.[0];
      profileName = contact?.profile?.name || null;

      if (!message) return res?.sendStatus(200);
      from = normalizarTelefono(message.from);
    }
    // ===== Caso 2: viene de Chatwoot (ECO / AGENTE) =====
    else if (req.text && req.from) {
      // 🛑 CORTE DE BUCLE DEFINITIVO: 
      // Si el mensaje viene de Chatwoot, ya fue procesado por chatwoot.js
      // No permitimos que el bot analice o responda a este mensaje.
      console.log("⏭️ Ignorando eco/agente de Chatwoot");
      return res?.sendStatus(200);
    } else {
      return res?.sendStatus(200);
    }

    console.log("📩 INPUT:", message.text?.body, "FROM:", from);

    const fromE164 = telefonoParaWhatsApp(from);
    const text = message.text?.body?.trim() || "";
    const inputLower = text.toLowerCase();

    // 👤 Cliente
    const client = await getOrCreateClient(from, profileName);

    // 🛡️ Enviar a Chatwoot (Solo mensajes que vienen de WhatsApp)
    if (text) {
      try {
        await forwardToChatwoot(from, client.name, text);
      } catch (err) {
        console.error("⚠️ Chatwoot falló:", err?.message || err);
      }
    }

    // ✋ Cancelar timers si el cliente escribe algo nuevo
    if (global.cotizacionTimers[from]) {
      clearTimeout(global.cotizacionTimers[from]);
      delete global.cotizacionTimers[from];
    }

    const esAdmin = ADMINS.includes(from);

    // =====================================================
    // 🔥 DETECCIÓN PRIORITARIA DE COTIZAR
    // =====================================================
    const palabrasCotizar = ["cotizar", "cotizacion", "cotización", "precio", "cuanto vale", "cuánto vale"];
    let forceCotizar = false;

    // Si detectamos intención de cotizar, activamos bandera y bloqueamos saludos
    if (
      !esAdmin &&
      !global.estadoCotizacion[from] &&
      palabrasCotizar.some(p => inputLower.includes(p))
    ) {
      forceCotizar = true;
      console.log("🔥 PRIORIDAD: COTIZAR DETECTADO");
    }

    // =====================================================
    // 🟦 MENU
    // =====================================================
    if (inputLower === "menu" || inputLower === "menú") {
      delete estadoCliente[from];
      delete global.estadoCotizacion[from];
      delete newOrderState[from];
      await enviar(from, menuPrincipal());
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 FORZAR FLUJO DE COTIZAR
    // =====================================================
    let input = text;
    if (forceCotizar) {
      input = "COTIZAR";
    }

    // =====================================================
    // 👋 SALUDOS
    // =====================================================
    const saludos = [
      "hola", "holi", "hla", "buenas", "buen día", "buen dia",
      "buenos días", "buenos dias", "buenas tardes", "buenas noches",
      "holaa", "buenass", "saludos",
    ];

    const esSaludo = saludos.some(
      (saludo) => inputLower === saludo || inputLower.startsWith(saludo + " ")
    );

    // Cambio aquí: Si es saludo PERO también es cotización, NO entra aquí
    if (esSaludo && !forceCotizar && !global.estadoCotizacion[from] && !adminState[from]) {
      const saludoHora = obtenerSaludoColombia();
      await enviar(from, {
        text: { body: `Hola, ${saludoHora} 😊\nEspero que estés muy bien.` },
      });
      await enviar(from, {
        text: { body: "Escribe *Menú* para ver opciones, o dime qué necesitas y con gusto te ayudo." },
      });
      return res?.sendStatus(200);
    }
    // =====================================================
    // 🟪 SALDO (esperando dato)
    // =====================================================
    if (estadoCliente[from] === "esperando_dato_saldo") {
      let dato = text;
      if (/^\+?\d{10,15}$/.test(text)) dato = normalizarTelefono(text);

      const resultado = await consultarSaldo(dato);

      if (resultado?.error || !Array.isArray(resultado)) {
        await enviar(from, saldoNoEncontrado());
        delete estadoCliente[from];
        return res.sendStatus(200);
      }

      if (resultado.length === 1)
        await enviar(from, saldoUnPedido(resultado[0]));
      else await enviar(from, seleccionarPedidoSaldo(resultado));

      delete estadoCliente[from];
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

      // ✅ GUARDAMOS EL PEDIDO PARA EL SIGUIENTE PASO
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
              `Pedido: ${pedido.order_code}\n` +
              `Trabajo: ${pedido.descripcion_trabajo}`,
          },
        });

        // ✅ Avisar al CLIENTE automáticamente
        if (result.numero_whatsapp) {
            const saludoHora = obtenerSaludoColombia();
          await enviar(result.numero_whatsapp, {
            text: {
              body:
                `Hola, ${saludoHora} 😊\n\n` +
                `Queremos informarte que tu pedido *${result.order_code}* ` +
                "ha sido cancelado.\n\n" +
                (result.descripcion_trabajo
                  ? `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n`
                  : "") +
                "Si tienes alguna duda o deseas retomarlo, escríbenos y con gusto te ayudamos 🤝",
            },
          });
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
    // 🟩 NOTIFICACIONES CLIENTE
    // =====================================================

    async function notificarCambioEstado(pedido, enviar) {
      // 🛡️ Validación defensiva
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
          `Tu pedido *${pedido.order_code}* ya está listo 🎉\n` +
          `Cuando quieras, escríbeme y coordinamos la entrega.`;
      }

      if (estado === "ENTREGADO") {
        mensaje =
          `Hola 🙌\n\n` +
          `Quería avisarte que tu pedido *${pedido.order_code}* ya fue entregado con éxito ✅\n\n` +
          `Gracias por confiar en nosotros.\n` +
          `Si necesitas algo más, aquí estamos 😊`;
      }

      if (!mensaje) return;

      await enviar(pedido.numero_whatsapp, {
        text: { body: mensaje },
      });
    }

    // =====================================================
    // =====================================================
    // 🟩 ADMIN: CAMBIO DE ESTADO MANUAL (ÚNICO)
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

      // ✅ ACTUALIZAR
      const pedido = await actualizarEstadoPedido(orderCode, nuevoEstado);

      if (!pedido) {
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

      // 📩 NOTIFICAR CLIENTE
      await notificarCambioEstado(pedido, enviar);

      delete adminState[from];

      // ✅ CONFIRMACIÓN ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Estado actualizado*\n\n` +
            `Pedido: ${pedido.order_code}\n` +
            `Nuevo estado: ${nuevoEstado.replace("_", " ")}`,
        },
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 ADMIN: ANTICIPO
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

      // ✅ VALIDACIÓN CLAVE: ya está pagado
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
      adminState[from].step = "anticipo_valor";

      await enviar(from, {
        text: {
          body:
            `💵 Ingresa el *valor abonado*\n` +
            `Saldo pendiente: $${Number(
              pedido.saldo_pendiente
            ).toLocaleString()}`,
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

      const result = await registrarAnticipo(
        adminState[from].orderCode,
        valor
      );

      // ❌ Excede saldo
      if (result?.error === "EXCEDE_SALDO") {
        await enviar(from, {
          text: {
            body:
              `❌ El valor ingresado excede el saldo pendiente.\n\n` +
              `Saldo actual: $${Number(result.saldo).toLocaleString()}`,
          },
        });
        return res.sendStatus(200);
      }

      // ✅ Ya estaba pagado (corte total del flujo)
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

      delete adminState[from];

      // ✅ Mensaje al ADMIN
      await enviar(from, {
        text: {
          body:
            `✅ *Anticipo registrado*\n\n` +
            `Pedido: ${result.order_code}\n` +
            `Abonado total: $${Number(
              result.valor_abonado
            ).toLocaleString()}\n` +
            `Saldo pendiente: $${Number(
              result.saldo_pendiente
            ).toLocaleString()}`,
        },
      });

      // ✅ Mensaje al CLIENTE
      let mensajeCliente =
        `💳 *Hemos recibido tu abono*\n\n` +
        `Pedido: ${result.order_code}\n` +
        `Abono recibido: $${valor.toLocaleString()}\n` +
        `Saldo pendiente: $${Number(
          result.saldo_pendiente
        ).toLocaleString()}\n\n` +
        `Gracias por tu pago 🙌`;

      if (Number(result.saldo_pendiente) <= 0) {
        mensajeCliente =
          `🎉 *¡Pago completado!*\n\n` +
          `Tu pedido *${result.order_code}* ya se encuentra completamente pagado.\n` +
          `¡Gracias por confiar en Muebles Nico!`;
      }

      await enviar(result.numero_whatsapp, {
        text: {
          body: mensajeCliente,
        },
      });

      return res.sendStatus(200);
    }

    // =====================================================
    // 🟦 CLIENTE: OPCIONES MENÚ / COTIZAR
    // =====================================================

    // IMPORTANTE: Mueve el if (input === "COTIZAR") arriba de los demás estados de cliente
    if (input === "COTIZAR") {
      global.estadoCotizacion[from] = { step: "tipoTrabajo" };

      // Enviamos primero la advertencia
      await enviar(from, {
        text: {
          body:
            "🪑 *Ten en cuenta que:*\n\n" +
            "Para los muebles que requieren *tapicería*:\n" +
            "• Se cobra únicamente la *mano de obra*.\n" +
            "• Los materiales los adquiere el cliente (yo te indico cuáles).\n\n" +
            "Fabricamos y también *restauramos* muebles.",
        },
      });

      // Enviamos la pregunta
      await enviar(from, {
        text: {
          body:
            "¿Qué necesitas hacer? 👇\n\n" +
            "1️⃣ Fabricar un mueble nuevo\n" +
            "2️⃣ Restaurar o tapizar un mueble\n" +
            "3️⃣ Otro arreglo\n\n" +
            "Responde con el número o tu mensaje.",
        },
      });
      return res.sendStatus(200);
    }

    // 🧠 RESPUESTAS DEL FLUJO DE COTIZACIÓN
    if (global.estadoCotizacion?.[from]) {
      const estado = global.estadoCotizacion[from];

      // PASO 1: tipo de trabajo
      if (estado.step === "tipoTrabajo") {
        const textLower = inputLower;
        if (["1", "fabricar", "nuevo"].some((x) => textLower.includes(x))) {
          await enviar(from, {
            text: {
              body:
                "🔹 *Fabricar mueble nuevo*\n\nCuéntame qué mueble tienes en mente 😊\nPuedes enviarme:\n• Fotos o referencias\n• Medidas aproximadas\n\nSi no estás segur@, también podemos asesorarte.",
            },
          });
          estado.step = "detalleTrabajo";
          estado.tipo = "fabricar";
          return res.sendStatus(200);
        }
        if (["2", "restaurar", "tapizar"].some((x) => textLower.includes(x))) {
          await enviar(from, {
            text: {
              body:
                "🔹 *Restaurar o tapizar*\n\nEnvíame por favor:\n• Fotos actuales del mueble\n• Qué te gustaría cambiar o mejorar",
            },
          });
          estado.step = "detalleTrabajo";
          estado.tipo = "restaurar";
          return res.sendStatus(200);
        }
        await enviar(from, {
          text: {
            body:
              "🔹 *Otro arreglo*\n\nCuéntame qué necesitas hacer y, si es posible,\nenvíame una foto del área o mueble.",
          },
        });
        estado.step = "detalleTrabajo";
        estado.tipo = "otro";
        return res.sendStatus(200);
      }

      // PASO FINAL: detalle del trabajo
      if (estado.step === "detalleTrabajo") {
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

      // 🟢 UN SOLO PEDIDO
      if (pedidos.length === 1) {
        const pedido = pedidos[0];

        // ✅ PEDIDO YA ENTREGADO
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

        // 📦 Pedido activo normal
        await enviar(from, estadoPedidoTemplate(pedido));
        return res.sendStatus(200);
      }

      // 🟢 VARIOS PEDIDOS → selector
      await enviar(from, seleccionarPedidoEstado(pedidos));
      return res.sendStatus(200);
    }

    // =====================================================
    // 💰 CLIENTE: SALDO
    // =====================================================
    if (input === "SALDO") {
      const pedidos = await consultarSaldo(from);

      if (
        pedidos?.error ||
        !Array.isArray(pedidos) ||
        pedidos.length === 0
      ) {
        await enviar(from, {
          text: {
            body: "📭 No encontramos pedidos activos asociados a este número.",
          },
        });
        return res.sendStatus(200);
      }

      // 🟢 UN SOLO PEDIDO
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

      // 🟢 VARIOS PEDIDOS
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

      // ✅ PEDIDO YA ENTREGADO
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

      // 📦 Pedido activo normal
      await enviar(from, estadoPedidoTemplate(pedido));
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err);
    return res.sendStatus(500);
  }
};