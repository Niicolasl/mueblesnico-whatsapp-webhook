import { formatearFecha } from "./date.js";

/* =====================================================
   🟦 MENÚ PRINCIPAL
===================================================== */
export const menuPrincipal = () => ({
  interactive: {
    type: "list",
    body: {
      text:
        "Perfecto 😊\n\n" +
        "Estas son las opciones en las que te puedo ayudar 👇"
    },
    action: {
      button: "📋 Ver opciones",
      sections: [
        {
          title: "Opciones disponibles",
          rows: [
            { id: "COTIZAR", title: "🪑 Cotizar mueble" },
            { id: "PEDIDO", title: "📦 Estado de pedido" },
            { id: "SALDO", title: "💰 Consultar saldo" },
            { id: "GARANTIA", title: "🛡️ Garantía" },
            { id: "TIEMPOS", title: "⏱️ Tiempos de entrega" }
          ]
        }
      ]
    }
  }
});

/* =====================================================
   📭 SIN PEDIDOS / SALDO NO ENCONTRADO
===================================================== */
export const saldoNoEncontrado = () => ({
  text: {
    body:
      "No encontré pedidos activos asociados a este número 😕\n\n" +
      "Si quieres, escribe *Menu* y miramos qué más puedo ayudarte."
  }
});

/* =====================================================
   💰 PEDIR DATO SALDO
===================================================== */
export const pedirDatoSaldo = () => ({
  text: {
    body:
      "Perfecto 😊 te ayudo con eso.\n\n" +
      "Envíame uno de estos datos:\n" +
      "• El *código del pedido* (ej: MN-2025-0001)\n" +
      "• O tu *número de WhatsApp*\n\n" +
      "Con eso reviso tu saldo enseguida 👍"
  }
});

/* =====================================================
   💰 SALDO – UN PEDIDO
===================================================== */
export const saldoUnPedido = (order) => ({
  interactive: {
    type: "button",
    body: {
      text:
        `Aquí te dejo el estado de tu saldo 💳\n\n` +
        `🆔 *Pedido:* ${order.codigo}\n` +
        `🛠️ *Trabajo:* ${order.descripcion}\n` +
        `💵 *Total:* $${Number(order.total).toLocaleString()}\n` +
        `💳 *Abonado:* $${Number(order.anticipo).toLocaleString()}\n` +
        `🔻 *Saldo pendiente:* $${Number(order.saldo).toLocaleString()}`
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "ABONAR", title: "💵 Quiero abonar" } },
        { type: "reply", reply: { id: "MENU", title: "📋 Volver al menú" } }
      ]
    }
  }
});

/* =====================================================
   💰 SALDO – VARIOS PEDIDOS
===================================================== */
export const seleccionarPedidoSaldo = (orders) => ({
  interactive: {
    type: "list",
    body: {
      text:
        "Veo que tienes varios pedidos activos 😊\n\n" +
        "Selecciona el que quieras revisar:"
    },
    action: {
      button: "Ver pedidos",
      sections: [
        {
          title: "Mis pedidos",
          rows: orders.map(o => ({
            id: `SALDO_${o.id}`,
            title: o.codigo,
            description: `Saldo pendiente: $${Number(o.saldo).toLocaleString()}`
          }))
        }
      ]
    }
  }
});

/* =====================================================
   📦 LISTA PEDIDOS (ESTADO)
===================================================== */
export const seleccionarPedidoEstado = (pedidos) => ({
  interactive: {
    type: "list",
    body: {
      text:
        "Estos son tus pedidos activos 📦\n\n" +
        "Elige uno para ver cómo va:"
    },
    action: {
      button: "Ver pedidos",
      sections: [
        {
          title: "Mis pedidos",
          rows: pedidos.map(p => ({
            id: `PEDIDO_${p.id}`,
            title: p.order_code,
            description: estadoPedidoCorto(p.estado_pedido)
          }))
        }
      ]
    }
  }
});

/* =====================================================
   📦 ESTADO PEDIDO
===================================================== */
export const estadoPedidoTemplate = (pedido) => ({
  text: {
    body:
      `Así va tu pedido 😊\n\n` +
      `🆔 *Pedido:* ${pedido.order_code}\n` +
      `📌 *Estado:* ${textoEstadoPedido(pedido.estado_pedido)}\n` +
      `📅 *Entrega estimada:* ${pedido.fecha_aprox_entrega
        ? formatearFecha(pedido.fecha_aprox_entrega)
        : "Por definir"
      }\n\n` +
      `Si necesitas algo más, escribe *Menu*.`
  }
});

/* =====================================================
   💵 MEDIOS DE PAGO
===================================================== */
export const infoMediosPago = () => ({
  text: {
    body:
      "Estos son los medios de pago disponibles 💵\n\n" +
      "• Nequi / Daviplata: 3125906313\n" +
      "• Bancolombia (Ahorros): 941-000017-43\n" +
      "Daniel Perez Rodriguez\n\n" +
      "Cuando realices el pago, envíame el comprobante y yo lo registro 👍"
  }
});

/* =====================================================
   🧠 HELPERS
===================================================== */
export const textoEstadoPedido = (estado) => {
  switch (estado) {
    case "pendiente de anticipo":
      return "⏳ Pendiente de anticipo";
    case "pendiente de inicio":
      return "🛠️ En fabricación";
    case "pagado":
      return "🎉 Pagado";
    case "entregado":
      return "✅ Entregado";
    case "cancelado":
    case "CANCELADO":
      return "❌ Cancelado";
    default:
      return estado;
  }
};

export const estadoPedidoCorto = textoEstadoPedido;
