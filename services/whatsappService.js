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
// 🔧 Helper de envío
// =====================================================
const enviar = async (to, payload) => {
  const toWhatsapp = telefonoParaWhatsApp(to);

  // Soporta ambos formatos de payload
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
  // si ya existe un timer, lo cancelamos
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

    // limpiamos timer
    delete global.cotizacionTimers[from];
  }, 13 * 1000); // ⏱️ 13sg
};

// =====================================================
// 📲 HANDLER PRINCIPAL (WhatsApp + Chatwoot)
// =====================================================

export const handleMessage = async (req, res) => {
  try {
    // 🛑 CORTE DE BUCLE: Si no viene de WhatsApp (Webhook oficial), ignoramos ecos.
    if (!req.body?.entry) {
      return res?.sendStatus(200);
    }

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0]; // 👈 Objeto completo del mensaje
    const contact = changes?.value?.contacts?.[0];
    const profileName = contact?.profile?.name || null;

    if (!message) return res.sendStatus(200);

    // 📞 Número entrante normalizado (SIN 57)
    const from = normalizarTelefono(message.from);

    // 👤 Sincronizar con base de datos de clientes
    const client = await getOrCreateClient(from, profileName);

    // ✋ Cancelamos SOLO si el cliente sigue en el flujo de cotización
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

    // 🛡️ Sincronizar mensaje entrante con Chatwoot (CORREGIDO)
    // Ahora enviamos 'message' completo en lugar de solo 'text'
    try {
      await forwardToChatwoot(from, client.name, message);
    } catch (err) {
      console.error("⚠️ Error Chatwoot:", err?.message);
    }

    const estado = global.estadoCliente;
    const esAdmin = ADMINS.includes(from);
    // =====================================================
    // 🧠 DETECCIÓN PRIORITARIA DE "COTIZAR" (ANTES DEL SALUDO)
    // =====================================================
    if (
      !global.estadoCotizacion?.[from] &&
      !adminState[from] &&
      /\bcotizar\b/.test(inputLower)
    ) {
      forceCotizar = true;
    }

    // =====================================================
    // 👋 SALUDOS NATURALES (ANTES DE TODO)
    // =====================================================
    const saludos = ["hola", "holi", "hla", "buenas", "buen día", "buen dia", "buenos días", "buenos dias", "buenas tardes", "buenas noches", "holaa", "buenass", "saludos"];

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

      // 👉 Si NO va a cotizar, mostramos menú y salimos
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
    // 🟩 ADMIN: LÓGICA DE GESTIÓN
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
          delete adminState[from];
          return res.sendStatus(200);
        }
        await enviar(from, { text: { body: "❎ Cancelación abortada." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      // Abonos y Estados (Comandos)
      const comandosEstado = { "/listo": "LISTO", "/entregado": "ENTREGADO" };
      if (comandosEstado[inputLower]) {
        adminState[from] = { step: "estado_codigo", nuevoEstado: comandosEstado[inputLower] };
        await enviar(from, { text: { body: "📌 Ingresa el *código del pedido*" } });
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

        const result = await registrarAnticipo(adminState[from].orderCode, valor);

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
    }

    // =====================================================
    // 🟦 CLIENTE: COTIZAR
    // =====================================================
    if (input === "COTIZAR") {
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

    // 🧠 FLUJO DE COTIZACIÓN (Pasos)
    if (global.estadoCotizacion?.[from]) {
      const estadoCot = global.estadoCotizacion[from];
      if (estadoCot.step === "tipoTrabajo") {
        if (["1", "fabricar", "nuevo"].some((x) => inputLower.includes(x))) {
          await enviar(from, { text: { body: "🔹 *Fabricar mueble nuevo*\n\nCuéntame qué mueble tienes en mente 😊\nPuedes enviarme:\n• Fotos o referencias\n• Medidas aproximadas\n\nSi no estás segur@, también podemos asesorarte." } });
          estadoCot.step = "detalleTrabajo"; return res.sendStatus(200);
        }
        if (["2", "restaurar", "tapizar"].some((x) => inputLower.includes(x))) {
          await enviar(from, { text: { body: "🔹 *Restaurar o tapizar*\n\nEnvíame por favor:\n• Fotos actuales del mueble\n• Qué te gustaría cambiar o mejorar" } });
          estadoCot.step = "detalleTrabajo"; return res.sendStatus(200);
        }
        await enviar(from, { text: { body: "🔹 *Otro arreglo*\n\nCuéntame qué necesitas hacer y, si es posible,\nenvíame una foto del área o mueble." } });
        estadoCot.step = "detalleTrabajo"; return res.sendStatus(200);
      }
      if (estadoCot.step === "detalleTrabajo") {
        programarMensajeAsesor(from);
        delete global.estadoCotizacion[from];
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 📦 CLIENTE: ACCIONES MENÚ
    // =====================================================
    if (input === "PEDIDO") {
      const pedidos = await getPedidosByPhone(from);
      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
        return res.sendStatus(200);
      }
      if (pedidos.length === 1) {
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
        return res.sendStatus(200);
      }
      if (pedidos.length === 1) {
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

    // 🎯 SELECCIONES INTERACTIVAS (SALDO_ ID / PEDIDO_ ID)
    if (typeof input === "string" && (input.startsWith("SALDO_") || input.startsWith("PEDIDO_"))) {
      const isSaldo = input.startsWith("SALDO_");
      const id = input.replace(isSaldo ? "SALDO_" : "PEDIDO_", "").trim();
      if (!/^\d+$/.test(id)) return res.sendStatus(200);

      const pedidos = isSaldo ? await consultarSaldo(from) : await getPedidosByPhone(from);
      if (!Array.isArray(pedidos)) return res.sendStatus(200);

      const pedido = pedidos.find((p) => String(p.id) === id);
      if (!pedido) return res.sendStatus(200);

      if (isSaldo) {
        if (Number(pedido.saldo) === 0) {
          await enviar(from, { text: { body: "💚 Este pedido ya fue pagado en su totalidad.\n\nActualmente se encuentra en proceso o pendiente de entrega 🙌" } });
        } else {
          await enviar(from, saldoUnPedido(pedido));
        }
      } else {
        if (pedido.estado_pedido === "ENTREGADO") {
          await enviar(from, { text: { body: "✅ Este pedido ya fue entregado 🙌\n\nSi necesitas algo más o tienes alguna duda, escríbeme con confianza 😊" } });
        } else {
          await enviar(from, estadoPedidoTemplate(pedido));
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