import axios from "axios";
import FormData from "form-data";
import "dotenv/config";

// =====================================================
// 📦 IMPORTACIONES DE FLUJOS Y BASE DE DATOS
// =====================================================
import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState,
} from "../flows/newOrderFlow.js";

import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { registrarAnticipo } from "../db/anticipo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { obtenerPedidoActivo } from "../db/validarPedidoActivo.js";
import { actualizarEstadoPedido } from "../db/actualizarEstadoPedido.js";
import { getPedidosByPhone } from "../db/orders.js";

// =====================================================
// 🔧 IMPORTACIONES DE UTILS Y TEMPLATES
// =====================================================
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

// =====================================================
// ⚙️ VARIABLES DE ENTORNO Y GLOBALES
// =====================================================
const CHATWOOT_BASE = process.env.CHATWOOT_BASE_URL || "https://app.chatwoot.com";
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = process.env.CHATWOOT_INBOX_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const ADMINS = ["3204128555", "3125906313"];
const adminState = {};

// ⏱️ Timers y Estados globales
global.cotizacionTimers = global.cotizacionTimers || {};
global.estadoCotizacion = global.estadoCotizacion || {};
global.estadoCliente = global.estadoCliente || {};

// Cache para no saturar la API de Chatwoot buscando conversaciones
const conversationCache = new Map();

const cwHeaders = {
  api_access_token: CHATWOOT_TOKEN,
  "Content-Type": "application/json",
};

// =====================================================
// 🛠️ HELPERS DE COMUNICACIÓN
// =====================================================

/**
 * Envía mensajes a través de la API de WhatsApp
 */
const enviar = async (to, payload) => {
  const toWhatsapp = telefonoParaWhatsApp(to);

  if (payload?.type === "interactive") {
    return sendMessage(toWhatsapp, {
      type: "interactive",
      interactive: payload.interactive,
    });
  }

  return sendMessage(toWhatsapp, payload);
};

/**
 * Formatea número a E.164 para Chatwoot (+57...)
 */
const formatE164 = (phone) => {
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10 && cleaned.startsWith("3")) {
    cleaned = "57" + cleaned;
  }
  return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
};

// =====================================================
// 💬 LÓGICA DE INTEGRACIÓN CHATWOOT
// =====================================================

/**
 * Busca o crea un contacto en Chatwoot basado en el teléfono
 */
const getOrCreateContactCW = async (phone, name) => {
  try {
    const e164 = formatE164(phone);

    // Buscar contacto existente
    const searchResponse = await axios.get(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${e164}`,
      { headers: cwHeaders }
    );

    if (searchResponse.data.payload.length > 0) {
      return searchResponse.data.payload[0].id;
    }

    // Si no existe, crearlo
    const createResponse = await axios.post(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
      {
        name: name || e164,
        phone_number: e164,
        identifier: e164,
      },
      { headers: cwHeaders }
    );

    return createResponse.data.payload.contact.id;
  } catch (error) {
    console.error("❌ Error en getOrCreateContactCW:", error.message);
    return null;
  }
};

/**
 * Busca o crea una conversación activa en Chatwoot
 */
const getOrCreateConversationCW = async (contactId, phone) => {
  try {
    const e164 = formatE164(phone);

    if (conversationCache.has(e164)) {
      return conversationCache.get(e164);
    }

    // Buscar conversaciones abiertas
    const convosResponse = await axios.get(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
      { headers: cwHeaders }
    );

    const existingConvo = convosResponse.data.payload.find(
      (c) => c.contact_id === contactId && c.status !== "resolved" && c.inbox_id == INBOX_ID
    );

    if (existingConvo) {
      conversationCache.set(e164, existingConvo.id);
      return existingConvo.id;
    }

    // Crear nueva si no hay abierta
    const createConvo = await axios.post(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
      {
        source_id: e164,
        inbox_id: INBOX_ID,
        contact_id: contactId,
        status: "open",
      },
      { headers: cwHeaders }
    );

    conversationCache.set(e164, createConvo.data.id);
    return createConvo.data.id;
  } catch (error) {
    console.error("❌ Error en getOrCreateConversationCW:", error.message);
    return null;
  }
};

/**
 * Sincroniza mensajes entrantes (Texto y Multimedia) con Chatwoot
 */
const syncMessageToChatwoot = async (from, name, message) => {
  try {
    const contactId = await getOrCreateContactCW(from, name);
    const conversationId = await getOrCreateConversationCW(contactId, from);

    if (!conversationId) return;

    const msgType = message.type;
    const isMedia = ["image", "video", "audio", "document"].includes(msgType);

    if (isMedia) {
      const mediaInfo = message[msgType];

      // Obtener URL de descarga desde Meta
      const metaRes = await axios.get(`https://graph.facebook.com/v20.0/${mediaInfo.id}`, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      });

      const fileRes = await axios.get(metaRes.data.url, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        responseType: "arraybuffer",
      });

      const form = new FormData();
      form.append("content", mediaInfo.caption || `Archivo ${msgType} recibido`);
      form.append("message_type", "incoming");

      const extension = metaRes.data.mime_type.split("/")[1] || "bin";
      form.append("attachments[]", Buffer.from(fileRes.data), {
        filename: `attachment_${Date.now()}.${extension}`,
        contentType: metaRes.data.mime_type,
      });

      await axios.post(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        form,
        { headers: { ...cwHeaders, ...form.getHeaders() } }
      );
    } else {
      // Mensaje de texto o interactivo
      let content = message.text?.body || "";

      if (message.interactive) {
        const iType = message.interactive.type;
        content = `🔘 [Botón]: ${message.interactive[iType]?.title || "Selección interactiva"}`;
      }

      if (content) {
        await axios.post(
          `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          { content, message_type: "incoming" },
          { headers: cwHeaders }
        );
      }
    }
  } catch (error) {
    console.error("❌ syncMessageToChatwoot Error:", error.message);
  }
};

// =====================================================
// ⏱️ GESTIÓN DE TIEMPOS Y NOTIFICACIONES
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

async function notificarCambioEstado(pedido, enviarFunc) {
  if (!pedido || !pedido.estado_pedido || !pedido.order_code || !pedido.numero_whatsapp) {
    console.error("❌ notificarCambioEstado recibió un pedido inválido");
    return;
  }

  const saludoHora = obtenerSaludoColombia();
  let mensaje = null;
  const estado = pedido.estado_pedido.toUpperCase();

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

  await enviarFunc(pedido.numero_whatsapp, {
    text: { body: mensaje },
  });
}
// =====================================================
// 📲 HANDLER PRINCIPAL (handleMessage)
// =====================================================

export const handleMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (!message) return res.sendStatus(200);

    const from = normalizarTelefono(message.from);
    const profileName = contact?.profile?.name || "Cliente";

    // 🔄 SINCRONIZACIÓN CON CHATWOOT (Sin interrumpir el bot)
    await syncMessageToChatwoot(message.from, profileName, message);

    // ✋ Cancelamos temporizador de cotización si el cliente escribe
    if (global.estadoCotizacion?.[from] && global.cotizacionTimers?.[from]) {
      clearTimeout(global.cotizacionTimers[from]);
      delete global.cotizacionTimers[from];
    }

    // Procesamiento de texto e interactivos
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

    console.log(`📩 INPUT REIBIDO: [${input}] DE: [${from}]`);

    if (!global.estadoCliente) global.estadoCliente = {};
    const estado = global.estadoCliente;
    const esAdmin = ADMINS.includes(from);

    // =====================================================
    // 🧠 DETECCIÓN PRIORITARIA "COTIZAR"
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
            body: "Escribe *Menú* en el momento que desees para ver todas las opciones, o si prefieres dime qué necesitas y con gusto te ayudo.",
          },
        });
        return res.sendStatus(200);
      }
    }

    if (forceCotizar) input = "COTIZAR";

    // =====================================================
    // 🟪 ESTADO: ESPERANDO DATO SALDO
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
    // 🟦 COMANDO MENÚ
    // =====================================================
    if (inputLower === "menu" || inputLower === "menú") {
      delete estado[from];
      delete newOrderState[from];
      await enviar(from, menuPrincipal());
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 LÓGICA DE ADMINISTRADOR (ADMIN)
    // =====================================================
    if (esAdmin) {
      // 1. Iniciar Nuevo Pedido
      if (inputLower === "/nuevop") {
        await startNewOrderFlow(from);
        return res.sendStatus(200);
      }

      // 2. Manejar pasos de Nuevo Pedido
      if (newOrderState[from]) {
        await handleNewOrderStep(from, text);
        return res.sendStatus(200);
      }

      // 3. Cancelar Pedido
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
        } else if (validacion.error === "CANCELADO") {
          await enviar(from, { text: { body: "⛔ Este pedido ya está cancelado." } });
          delete adminState[from];
        } else {
          adminState[from] = { step: "confirmar_cancelacion", pedido: validacion.pedido };
          const pedido = validacion.pedido;
          await enviar(from, {
            text: {
              body: "⚠️ *Confirma la cancelación*\n\n" +
                `Pedido: *${pedido.order_code}*\n` +
                `Trabajo: ${pedido.descripcion_trabajo}\n\n` +
                "Escribe *SI* para confirmar o *NO* para cancelar la acción.",
            },
          });
        }
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
            await enviar(from, {
              text: {
                body: "❌ *Pedido cancelado correctamente*\n\n" +
                  `Pedido: ${pedido.order_code}\n` +
                  `Trabajo: ${pedido.descripcion_trabajo}`,
              },
            });

            if (result.numero_whatsapp) {
              const saludoHora = obtenerSaludoColombia();
              await enviar(result.numero_whatsapp, {
                text: {
                  body: `Hola, ${saludoHora} 😊\n\n` +
                    `Queremos informarte que tu pedido *${result.order_code}* ha sido cancelado.\n\n` +
                    (result.descripcion_trabajo ? `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n` : "") +
                    "Si tienes alguna duda o deseas retomarlo, escríbenos y con gusto te ayudamos 🤝",
                },
              });
            }
          }
        } else {
          await enviar(from, { text: { body: "❎ Cancelación abortada." } });
        }
        delete adminState[from];
        return res.sendStatus(200);
      }

      // 4. Cambios de Estado (/listo, /entregado)
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
          await enviar(from, { text: { body: "⚠️ Este pedido ya fue finalizado.\nNo se puede cambiar su estado." } });
        } else {
          const pedido = await actualizarEstadoPedido(orderCode, nuevoEstado);
          if (!pedido) {
            await enviar(from, { text: { body: "❌ No se pudo actualizar el estado del pedido." } });
          } else {
            await notificarCambioEstado(pedido, enviar);
            await enviar(from, {
              text: {
                body: `✅ *Estado actualizado*\n\nPedido: ${pedido.order_code}\nNuevo estado: ${nuevoEstado.replace("_", " ")}`,
              },
            });
          }
        }
        delete adminState[from];
        return res.sendStatus(200);
      }

      // 5. Registro de Abonos (/abono)
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
          await enviar(from, { text: { body: "❌ Este pedido está CANCELADO." } });
          delete adminState[from];
        } else if (Number(validacion.pedido.saldo_pendiente) <= 0) {
          await enviar(from, { text: { body: "✅ Este pedido ya se encuentra *completamente pagado*." } });
          delete adminState[from];
        } else {
          adminState[from].orderCode = codigo;
          adminState[from].step = "anticipo_valor";
          await enviar(from, {
            text: {
              body: `💵 Ingresa el *valor abonado*\n` +
                `Saldo pendiente: $${Number(validacion.pedido.saldo_pendiente).toLocaleString()}`,
            },
          });
        }
        return res.sendStatus(200);
      }

      if (adminState[from]?.step === "anticipo_valor") {
        const base = Number(input.replace(/[^\d]/g, ""));
        const valor = base < 1000 ? base * 1000 : base;

        if (!valor || valor <= 0) {
          await enviar(from, { text: { body: "❌ Valor inválido." } });
          return res.sendStatus(200);
        }

        const result = await registrarAnticipo(adminState[from].orderCode, valor);

        if (result?.error === "EXCEDE_SALDO") {
          await enviar(from, { text: { body: `❌ Excede el saldo. Actual: $${Number(result.saldo).toLocaleString()}` } });
        } else if (result?.error === "PAGADO") {
          await enviar(from, { text: { body: "✅ Ya está pagado." } });
          delete adminState[from];
        } else if (!result) {
          await enviar(from, { text: { body: "❌ Error al registrar." } });
          delete adminState[from];
        } else {
          await enviar(from, {
            text: {
              body: `✅ *Anticipo registrado*\n\n` +
                `Pedido: ${result.order_code}\n` +
                `Total abonado: $${Number(result.valor_abonado).toLocaleString()}\n` +
                `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}`,
            },
          });

          let mensajeCliente = `💳 *Hemos recibido tu abono*\n\n` +
            `Pedido: ${result.order_code}\n` +
            `Abono recibido: $${valor.toLocaleString()}\n` +
            `Saldo pendiente: $${Number(result.saldo_pendiente).toLocaleString()}\n\n` +
            `Gracias por tu pago 🙌`;

          if (Number(result.saldo_pendiente) <= 0) {
            mensajeCliente = `🎉 *¡Pago completado!*\n\nTu pedido *${result.order_code}* ya se encuentra pagado.\n¡Gracias por confiar en Muebles Nico!`;
          }

          await enviar(result.numero_whatsapp, { text: { body: mensajeCliente } });
          delete adminState[from];
        }
        return res.sendStatus(200);
      }
    }

    // =====================================================
    // 🟦 LÓGICA DE CLIENTE
    // =====================================================

    // FLUJO COTIZACIÓN
    if (input === "COTIZAR") {
      global.estadoCotizacion[from] = { step: "tipoTrabajo" };
      await enviar(from, {
        text: {
          body: "🪑 *Ten en cuenta qué*\n\n" +
            "Para los muebles que requieren *tapicería*:\n" +
            "• Se cobra únicamente la *mano de obra*.\n" +
            "• Los materiales los adquiere el cliente, ya que su precio varía según diseño y calidad.(yo te indico cuales serian)\n\n" +
            "Fabricamos y también *restauramos* muebles.\n\n",
        },
      });

      await enviar(from, {
        text: {
          body: "¿Qué es lo que necesitas hacer? 👇\n\n" +
            "1️⃣ Fabricar un mueble nuevo\n" +
            "2️⃣ Restaurar o tapizar un mueble\n" +
            "3️⃣ Otro arreglo (reparaciones, rieles, chapas, instalación, etc.)\n\n" +
            "Respóndeme con el número o escríbelo con tus propias palabras.",
        },
      });
      return res.sendStatus(200);
    }

    if (global.estadoCotizacion?.[from]) {
      const estadoCot = global.estadoCotizacion[from];

      if (estadoCot.step === "tipoTrabajo") {
        if (["1", "fabricar", "nuevo"].some((x) => inputLower.includes(x))) {
          await enviar(from, {
            text: {
              body: "🔹 *Fabricar mueble nuevo*\n\nCuéntame qué mueble tienes en mente 😊\nPuedes enviarme:\n• Fotos o referencias\n• Medidas aproximadas\n\nSi no estás segur@, también podemos asesorarte.",
            },
          });
          estadoCot.step = "detalleTrabajo";
          return res.sendStatus(200);
        }

        if (["2", "restaurar", "tapizar"].some((x) => inputLower.includes(x))) {
          await enviar(from, {
            text: {
              body: "🔹 *Restaurar o tapizar*\n\nEnvíame por favor:\n• Fotos actuales del mueble\n• Qué te gustaría cambiar o mejorar",
            },
          });
          estadoCot.step = "detalleTrabajo";
          return res.sendStatus(200);
        }

        await enviar(from, {
          text: {
            body: "🔹 *Otro arreglo*\n\nCuéntame qué necesitas hacer y, si es posible,\nenvíame una foto del área o mueble.",
          },
        });
        estadoCot.step = "detalleTrabajo";
        return res.sendStatus(200);
      }

      if (estadoCot.step === "detalleTrabajo") {
        await programarMensajeAsesor(from);
        delete global.estadoCotizacion[from];
        return res.sendStatus(200);
      }
    }

    // CONSULTAS DE PEDIDO Y SALDO
    if (input === "PEDIDO") {
      const pedidos = await getPedidosByPhone(from);
      if (!pedidos.length) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
      } else if (pedidos.length === 1) {
        if (pedidos[0].estado_pedido === "ENTREGADO") {
          await enviar(from, { text: { body: "✅ Este pedido ya fue entregado 🙌\nSi necesitas algo más, escríbeme 😊" } });
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
      if (!pedidos.length) {
        await enviar(from, { text: { body: "📭 No encontramos pedidos activos asociados a este número." } });
      } else if (pedidos.length === 1) {
        if (Number(pedidos[0].saldo) === 0) {
          await enviar(from, { text: { body: "💚 Este pedido ya fue pagado en su totalidad." } });
        } else {
          await enviar(from, saldoUnPedido(pedidos[0]));
        }
      } else {
        await enviar(from, seleccionarPedidoSaldo(pedidos));
      }
      return res.sendStatus(200);
    }

    // Otros comandos Cliente
    if (input === "ABONAR") return await enviar(from, infoMediosPago()) || res.sendStatus(200);
    if (input === "GARANTIA") {
      await enviar(from, {
        text: {
          body: "🛡️ *GARANTÍA MUEBLES NICO*\n\n" +
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
          body: "⏳ Sobre los tiempos de entrega\n\n" +
            "El tiempo estimado de fabricación y entrega es de *hasta 15 días habiles* desde la confirmación del anticipo.\n\n" +
            "Este tiempo puede variar según el tipo de trabajo y la carga del taller, y en muchos casos el pedido puede estar listo antes.\n\n" +
            "Cuando tu pedido esté terminado, te contactaremos para coordinar la entrega o instalación.😊\n\n" +
            "Gracias por confiar en *Muebles Nico* 🙌",
        },
      });
      return res.sendStatus(200);
    }

    if (input === "ASESOR") {
      await enviar(from, { text: { body: "📞 Un asesor te contactará pronto." } });
      return res.sendStatus(200);
    }

    // Selecciones de listas (SALDO_ e PEDIDO_)
    if (typeof input === "string" && input.startsWith("SALDO_")) {
      const id = input.replace("SALDO_", "").trim();
      const pedidos = await consultarSaldo(from);
      const pedido = pedidos.find((p) => String(p.id) === id);
      if (pedido) await enviar(from, saldoUnPedido(pedido));
      return res.sendStatus(200);
    }

    if (typeof input === "string" && input.startsWith("PEDIDO_")) {
      const id = input.replace("PEDIDO_", "").trim();
      const pedidos = await getPedidosByPhone(from);
      const pedido = pedidos.find((p) => String(p.id) === id);
      if (pedido) await enviar(from, estadoPedidoTemplate(pedido));
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ ERROR GENERAL EN HANDLER:", err);
    if (!res.headersSent) res.sendStatus(500);
  }
};