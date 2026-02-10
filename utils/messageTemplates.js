import { formatearFecha } from "./date.js";
import { formatOrderInline, formatOrderHeader } from "./orderFormatter.js";

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
   💰 SALDO – UN PEDIDO
===================================================== */
export const saldoUnPedido = (order) => ({
  interactive: {
    type: "button",
    body: {
      text:
        `Aquí te dejo el estado de tu saldo 💳\n\n` +
        `📦 *Pedido:* ${order.codigo}\n` +
        `🛠️ *Trabajo:* ${order.descripcion}\n` +
        `💰 *Valor total:* $${Number(order.total).toLocaleString()}\n\n` +
        `💳 Abonado: $${Number(order.anticipo).toLocaleString()}\n` +
        `🔻 Saldo pendiente: $${Number(order.saldo).toLocaleString()}`
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
          rows: orders.map(o => {
            // 🔥 TRUNCAR descripción si excede 50 caracteres (dejando espacio para el saldo)
            const descripcionCorta = o.descripcion.length > 40
              ? o.descripcion.substring(0, 37) + "..."
              : o.descripcion;

            return {
              id: `SALDO_${o.id}`,
              title: o.codigo,
              description: `${descripcionCorta} - $${Number(o.saldo).toLocaleString()}`
            };
          })
        }
      ]
    }
  }
});
/* =====================================================
   💰 SALDO NO ENCONTRADO
===================================================== */
export const saldoNoEncontrado = () => ({
  text: {
    body:
      "❌ No encontré ningún pedido con ese dato.\n\n" +
      "Verifica que el código o número sea correcto e intenta nuevamente."
  }
});

/* =====================================================
   💰 PEDIR DATO PARA CONSULTAR SALDO
===================================================== */
export const pedirDatoSaldo = () => ({
  text: {
    body:
      "💳 *Consultar saldo*\n\n" +
      "Envíame uno de estos datos:\n" +
      "• Código del pedido (ej: MN-2026-0001)\n" +
      "• Tu número de WhatsApp (10 dígitos)"
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
          rows: pedidos.map(p => {
            // 🔥 TRUNCAR descripción si excede 50 caracteres
            const descripcionCorta = p.descripcion_trabajo.length > 45
              ? p.descripcion_trabajo.substring(0, 42) + "..."
              : p.descripcion_trabajo;

            const estadoTexto = estadoPedidoCorto(p.estado_pedido);

            return {
              id: `PEDIDO_${p.id}`,
              title: p.order_code,
              description: `${descripcionCorta} - ${estadoTexto}`
            };
          })
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
      `📦 *Pedido:* ${pedido.order_code}\n` +
      `🛠️ *Trabajo:* ${pedido.descripcion_trabajo}\n` +
      `📌 *Estado:* ${textoEstadoPedido(pedido.estado_pedido)}\n` +
      `📅 *Entrega estimada:* ${pedido.fecha_aprox_entrega
        ? formatearFecha(pedido.fecha_aprox_entrega)
        : "Por definir"
      }\n\n` +
      `Puedes escribir *menú* para ver el estado y saldo de tus pedidos`
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
    case "LISTO":
      return "✅ Listo para entrega";
    case "EN_FABRICACION":
      return "🛠️ En fabricación";
    default:
      return estado;
  }
};

export const estadoPedidoCorto = textoEstadoPedido;