import { formatearFecha } from "./date.js";

/* =====================================================
   🟦 MENÚ PRINCIPAL
===================================================== */
export const menuPrincipal = () => ({
  interactive: {
    type: "list",
    body: {
      text:
        "👋 *Bienvenido a Muebles Nico*\n\n" +
        "Selecciona una opción para continuar 👇"
    },
    action: {
      button: "📋 Abrir menú",
      sections: [
        {
          title: "Opciones disponibles",
          rows: [
            { id: "COTIZAR", title: "🪑 Cotizar mueble", description: "Solicitar una cotización" },
            { id: "PEDIDO", title: "📦 Estado de pedido", description: "Ver cómo va tu pedido" },
            { id: "SALDO", title: "💰 Consultar saldo", description: "Ver pagos y saldo pendiente" },
            { id: "GARANTIA", title: "🛡️ Garantía", description: "Condiciones y soporte" },
            { id: "TIEMPOS", title: "⏱️ Tiempos de entrega", description: "Plazos aproximados" },
            { id: "ASESOR", title: "📞 Hablar con asesor", description: "Atención personalizada" }
          ]
        }
      ]
    }
  }
});

/* =====================================================
   📭 SIN PEDIDOS
===================================================== */
export const noTienePedidos = () => ({
  text: {
    body:
      "📭 No encontramos pedidos activos asociados a este número.\n\n" +
      "Si deseas cotizar, selecciona *🪑 Cotizar mueble* en el menú."
  }
});

/* =====================================================
   📦 LISTA DE PEDIDOS (ESTADO)
===================================================== */
export const seleccionarPedidoEstado = (pedidos) => ({
  interactive: {
    type: "list",
    body: {
      text: "📦 Tienes varios pedidos. Selecciona uno para ver su estado:"
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
   📦 ESTADO DE UN PEDIDO (CLIENTE)
===================================================== */
export const estadoPedidoTemplate = (pedido) => {
  const estadoTexto = textoEstadoPedido(pedido.estado_pedido);

  const entregaTexto = pedido.fecha_aprox_entrega
    ? `📅 *Entrega estimada:* ${formatearFecha(pedido.fecha_aprox_entrega)}`
    : "📅 *Entrega estimada:* Se definirá al iniciar el pedido";

  return {
    text: {
      body:
        `📦 *Estado de tu pedido*\n\n` +
        `🆔 Código: *${pedido.order_code}*\n` +
        `📌 Estado: *${estadoTexto}*\n` +
        `${entregaTexto}\n\n` +
        `Escribe *MENU* para volver al inicio.`
    }
  };
};

/* =====================================================
   💰 SALDO – UN SOLO PEDIDO
===================================================== */
export const saldoUnPedido = (order) => ({
  interactive: {
    type: "button",
    body: {
      text:
        `💰 *Saldo de tu pedido*\n\n` +
        `🆔 Código: ${order.order_code}\n` +
        `🛠️ Trabajo: ${order.descripcion_trabajo}\n` +
        `💵 Total: $${Number(order.valor_total).toLocaleString()}\n` +
        `💳 Abonado: $${Number(order.valor_abonado).toLocaleString()}\n` +
        `🔻 Saldo pendiente: *$${Number(order.saldo_pendiente).toLocaleString()}*`
    },
    action: {
      buttons: [
        {
          type: "reply",
          reply: { id: "ABONAR", title: "💵 Abonar" }
        },
        {
          type: "reply",
          reply: { id: "MENU", title: "📋 Volver al menú" }
        }
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
    header: { type: "text", text: "💰 Tus saldos" },
    body: { text: "Selecciona el pedido del que deseas ver el saldo:" },
    action: {
      button: "Ver pedidos",
      sections: [
        {
          title: "Pedidos activos",
          rows: orders.map(o => ({
            id: `SALDO_${o.id}`,
            title: o.order_code,
            description: `Saldo pendiente: $${Number(o.saldo_pendiente).toLocaleString()}`
          }))
        }
      ]
    }
  }
});

/* =====================================================
   💵 MEDIOS DE PAGO
===================================================== */
export const infoMediosPago = () => ({
  text: {
    body:
      "💵 *Medios de pago disponibles*\n\n" +
      "• Nequi: 3125906313\n" +
      "• Daviplata: 3125906313\n" +
      "• Bancolombia: 941-000017-43 (Ahorros)\n" +
      "Daniel Perez Rodriguez\n" +
      "CC 79977638\n\n" +
      "📸 Cuando realices el pago, envía el comprobante y un asesor lo registrará."
  }
});

/* =====================================================
   🧠 HELPERS DE ESTADO
===================================================== */
export const textoEstadoPedido = (estado) => {
  switch (estado) {
    case "pendiente de anticipo":
      return "⏳ Pendiente de anticipo";
    case "pendiente de inicio":
      return "🛠️ En fabricación";
    case "pagado":
      return "🎉 Pago completo recibido";
    case "listo para entregar":
      return "📦 Listo para entregar";
    case "entregado":
      return "✅ Entregado";
    case "cancelado":
    case "CANCELADO":
      return "❌ Pedido cancelado";
    default:
      return estado;
  }
};

export const estadoPedidoCorto = (estado) => {
  switch (estado) {
    case "pendiente de anticipo":
      return "⏳ Pendiente de anticipo";
    case "pendiente de inicio":
      return "🛠️ En fabricación";
    case "pagado":
      return "🎉 Pagado";
    case "listo para entregar":
      return "📦 Listo";
    case "entregado":
      return "✅ Entregado";
    case "cancelado":
    case "CANCELADO":
      return "❌ Cancelado";
    default:
      return estado;
  }
};
