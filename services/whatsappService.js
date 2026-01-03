import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState
} from "../flows/newOrderFlow.js";

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
  infoMediosPago
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
// 👋 SALUDOS NATURALES (ANTES DE TODO)
// =====================================================
const saludos = [
  "hola",
  "holi",
  "hla",
  "buenas",
  "buen día",
  "buen dia",
  "buenos días",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "holaa",
  "buenass",
  "saludos",
];

const esSaludo = saludos.some(saludo =>
  inputLower === saludo || inputLower.startsWith(saludo)
);

if (
  esSaludo &&
  !global.estadoCotizacion?.[from] &&
  !global.adminState?.[from]
) {
  const saludoHora = obtenerSaludoColombia();

  await enviar(from, {
  text: {
    body:
      `Hola, ${saludoHora} 😊\n` +
      "Espero que estés muy bien."
  }
});

await enviar(from, {
  text: {
    body:
      "Escribe *Menu* para ver todas las opciones, o si prefieres dime qué necesitas y con gusto te ayudo.\n\n"
  }
});
;

  return res.sendStatus(200);
}

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

      const validacion = await obtenerPedidoActivo(orderCode);

      if (validacion.error === "NO_EXISTE") {
        await enviar(from, { text: { body: "❌ Pedido no encontrado." } });
        delete adminState[from];
        return res.sendStatus(200);
      }

      if (validacion.error === "CANCELADO") {
        await enviar(from, {
          text: { body: "⛔ Este pedido ya está cancelado." }
        });
        delete adminState[from];
        return res.sendStatus(200);
      }

      // ✅ GUARDAMOS EL PEDIDO PARA EL SIGUIENTE PASO
      adminState[from] = {
        step: "confirmar_cancelacion",
        pedido: validacion.pedido
      };

      const pedido = validacion.pedido;

      await enviar(from, {
        text: {
          body:
            "⚠️ *Confirma la cancelación*\n\n" +
            `Pedido: *${pedido.order_code}*\n` +
            `Trabajo: ${pedido.descripcion_trabajo}\n\n` +
            "Escribe *SI* para confirmar o *NO* para cancelar la acción."
        }
      });

      return res.sendStatus(200);

    }

    if(esAdmin && adminState[from]?.step === "confirmar_cancelacion") {
      const respuesta = inputLower;
      const pedido = adminState[from].pedido;

      if (respuesta === "si") {
        const result = await cancelarPedido(pedido.order_code);

        if (result === "error") {
          await enviar(from, {
            text: { body: "❌ Ocurrió un error al cancelar el pedido." }
          });
          delete adminState[from];
          return res.sendStatus(200);
        }

        await enviar(from, {
          text: {
            body:
              "❌ *Pedido cancelado correctamente*\n\n" +
              `Pedido: ${pedido.order_code}\n` +
              `Trabajo: ${pedido.descripcion_trabajo}`
          }
        });

        // ✅ Avisar al CLIENTE automáticamente
        if (result.numero_whatsapp) {
          await enviar(result.numero_whatsapp, {
            text: {
              body:
                "Hola 😊\n\n" +
                `Queremos informarte que tu pedido *${result.order_code}* ` +
                "ha sido cancelado.\n\n" +
                (result.descripcion_trabajo
                  ? `🛠️ Trabajo: ${result.descripcion_trabajo}\n\n`
                  : "") +
                "Si tienes alguna duda o deseas retomarlo, escríbenos y con gusto te ayudamos 🤝"
            }
          });
        }


        delete adminState[from];
        return res.sendStatus(200);
      }

      // ❌ NO
      await enviar(from, {
        text: { body: "❎ Cancelación abortada." }
      });

      delete adminState[from];
      return res.sendStatus(200);
    }

    // =====================================================
    // 🟩 NOTIFICACIONES CLIENTE
    // =====================================================

    async function notificarCambioEstado(pedido, enviar) {
      let mensaje = null;

      if (pedido.estado_pedido === "LISTO") {
        mensaje =
          `Hola 😊\n\n` +
          `Tu pedido *${pedido.order_code}* ya está listo 🎉\n` +
          `Cuando quieras, escríbeme y coordinamos la entrega.`;
      }

      if (pedido.estado_pedido === "ENTREGADO") {
        mensaje =
          `Hola 🙌\n\n` +
          `Quería avisarte que tu pedido *${pedido.order_code}* ` +
          `ya fue entregado con éxito ✅\n\n` +
          `Gracias por confiar en nosotros.`;
      }

      if (!mensaje) return;

      await enviar(pedido.numero_whatsapp, {
        text: { body: mensaje }
      });
    }


    // =====================================================
    // =====================================================
    // 🟩 ADMIN: CAMBIO DE ESTADO MANUAL (ÚNICO)
    // =====================================================

    const comandosEstado = { 
      "/panticipo": "PENDIENTE_ANTICIPO", //no esta en uso
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

      await notificarCambioEstado(pedido, enviar);
      
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
  // iniciamos estado de cotización para este cliente
  global.estadoCotizacion = global.estadoCotizacion || {};
  global.estadoCotizacion[from] = { step: "tipoTrabajo" };

  // mensaje 1: aclaración
  await enviar(from, {
    text: {
      body:
        "🪑 *Ten en cuenta qué*\n\n" +
        "Para los muebles que requieren *tapicería*:\n" +
        "• Se cobra únicamente la *mano de obra*.\n" +
        "• Los materiales los adquiere el cliente, ya que su precio varía según diseño y calidad.(yo te indico cuales serian)\n\n" +
        "Fabricamos y también *restauramos* muebles.\n\n" 
    }
  });

  // mensaje 2: clasificación del trabajo
  await enviar(from, {
  text: {
    body:
      "¿Qué es lo que necesitas hacer? 👇\n\n" +
      "1️⃣ Fabricar un mueble nuevo\n" +
      "2️⃣ Restaurar o tapizar un mueble\n" +
      "3️⃣ Otro arreglo (reparaciones, rieles, chapas, instalación, etc.)\n\n" +
      "Respóndeme con el número o escríbelo con tus propias palabras."
  }
});


  return res.sendStatus(200);
    }
    
// =====================================================
// 🧠 RESPUESTAS DEL FLUJO DE COTIZACIÓN
// =====================================================
if (global.estadoCotizacion?.[from]) {
  const estado = global.estadoCotizacion[from];

  // paso 1: el cliente responde tipo de trabajo
  if (estado.step === "tipoTrabajo") {
    const textLower = inputLower;

    if (["1","fabricar","nuevo"].some(x => textLower.includes(x))) {
      await enviar(from, {
        text: {
          body:
            "🔹 *Fabricar mueble nuevo*\n\n" +
            "Cuéntame qué mueble tienes en mente 😊\n" +
            "Si ya tienes una idea clara, puedes enviarme:\n" +
            "• Fotos o referencias\n" +
            "• Medidas aproximadas (si las sabes)\n\n" +
            "Si aún no estás segur@, también podemos asesorarte."
        }
      });

      estado.step = "detalleTrabajo";
      estado.tipo = "fabricar";
      return res.sendStatus(200);
    }

    if (["2","restaurar","tapizar"].some(x => textLower.includes(x))) {
      await enviar(from, {
        text: {
          body:
            "🔹 *Restaurar o tapizar*\n\n" +
            "Envíame por favor:\n" +
            "• Fotos actuales del mueble\n" +
            "• Qué te gustaría cambiar o mejorar\n\n" +
            "Con eso podre darte una cotización."
        }
      });

      estado.step = "detalleTrabajo";
      estado.tipo = "restaurar";
      return res.sendStatus(200);
    }

    // otro tipo de trabajo
    await enviar(from, {
      text: {
        body:
          "🔹 *Otro arreglo*\n\n" +
          "Cuéntame qué necesitas hacer y, si es posible,\n" +
          "envíame una foto del área o mueble a intervenir.\n\n" +
          "Con esa información te podre indicar el valor y tiempos."
      }
    });

    estado.step = "detalleTrabajo";
    estado.tipo = "otro";
    return res.sendStatus(200);
  }

  // paso 2: el cliente da detalles
  if (estado.step === "detalleTrabajo") {
    // aquí el cliente ya envía texto, fotos o enlaces
    // puedes decidir qué hacer, por ejemplo guardarlo o reenviarlo a tu admin

    await enviar(from, {
      text: {
        body:
          "Gracias 😊\n\n" +
          "Recibimos tu información. Un asesor te contactará pronto con la cotización."
      }
    });

    // borrar estado para finalizar
    delete global.estadoCotizacion[from];
    return res.sendStatus(200);
  }
}


    if (input === "PEDIDO") {
      const pedidos = await getPedidosByPhone(from);

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
          body: "🛡️ *GARANTÍA MUEBLES NICO*\n\n" +
          "Todos nuestros trabajos cuentan con *1 año de garantía*.\n\n" +
          "*La garantía cubre:*\n\n" +
          "• Defectos de fábrica en el material\n" +
          "• Problemas de instalación realizados por nosotros\n\n" +
          "*La garantía no cubre:*\n\n" +
          "• Humedad\n" +
          "• Golpes o mal uso\n" +
          "• Intervenciones de terceros\n\n" +
          "🤝 Si llegas a tener algún inconveniente, con gusto lo revisamos y te damos solución de la manera más rápida posible."
        }
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
                "Gracias por confiar en *Muebles Nico* 🙌"
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

      const pedidos = await getPedidosByPhone(from);

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
