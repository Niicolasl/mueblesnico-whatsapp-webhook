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
            { id: "COTIZAR", title: "🪑 Cotizar mueble" },
            { id: "PEDIDO", title: "📦 Estado de pedido" },
            { id: "SALDO", title: "💰 Consultar saldo" },
            { id: "GARANTIA", title: "🛡️ Garantía" },
            { id: "TIEMPOS", title: "⏱️ Tiempos de entrega" },
            { id: "ASESOR", title: "📞 Hablar con asesor" }
          ]
        }
      ]
    }
  }
});

/* =====================================================
   📭 SIN PEDIDOS
===================================================== */
export const saldoNoEncontrado = () => ({
  text: {
    body:
      "📭 No encontramos pedidos activos asociados a este número.\n\n" +
      "Escribe *MENU* para volver al inicio."
  }
});

/* =====================================================
   💰 PEDIR DATO SALDO
===================================================== */
export const pedirDatoSaldo = () => ({
  text: {
    body:
      "💰 *Consulta de saldo*\n\n" +
      "Escribe:\n" +
      "• Código del pedido (ej: MN-2025-0001)\n" +
      "• O tu número de WhatsApp\n\n" +
      "Ejemplo:\nMN-2025-0001"
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
        `💰 *Saldo de tu pedido*\n\n` +
        `🆔 Código: ${order.order_code}\n` +
        `🛠️ Trabajo: ${order.descripcion_trabajo}\n` +
        `💵 Total: $${Number(order.valor_total).toLocaleString()}\n` +
        `💳 Abonado: $${Number(order.valor_abonado).toLocaleString()}\n` +
        `🔻 Saldo pendiente: *$${Number(order.saldo_pendiente).toLocaleString()}*`
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "ABONAR", title: "💵 Abonar" } },
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
    body: { text: "Selecciona el pedido:" },
    action: {
      button: "Ver pedidos",
      sections: [
        {
          title: "Pedidos",
          rows: orders.map(o => ({
            id: `SALDO_${o.id}`,
            title: o.order_code,
            description: `Saldo: $${Number(o.saldo_pendiente).toLocaleString()}`
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
    body: { text: "Selecciona un pedido:" },
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
      `📦 *Estado de tu pedido*\n\n` +
      `🆔 Código: *${pedido.order_code}*\n` +
      `📌 Estado: *${textoEstadoPedido(pedido.estado_pedido)}*\n` +
      `📅 Entrega estimada: ${pedido.fecha_aprox_entrega
        ? formatearFecha(pedido.fecha_aprox_entrega)
        : "Por definir"}\n\n` +
      `Escribe *MENU* para volver al inicio.`
  }
});

/* =====================================================
   💵 MEDIOS DE PAGO
===================================================== */
export const infoMediosPago = () => ({
  text: {
    body:
      "💵 *Medios de pago*\n\n" +
      "• Nequi / Daviplata: 3125906313\n" +
      "• Bancolombia Ahorros: 941-000017-43\n" +
      "Daniel Perez Rodriguez\n\n" +
      "📸 Envía el comprobante para registrar tu pago."
  }
});

/* =====================================================
   🧠 HELPERS
===================================================== */
export const textoEstadoPedido = (estado) => {
  switch (estado) {
    case "pendiente de anticipo": return "⏳ Pendiente de anticipo";
    case "pendiente de inicio": return "🛠️ En fabricación";
    case "pagado": return "🎉 Pagado";
    case "entregado": return "✅ Entregado";
    case "cancelado":
    case "CANCELADO": return "❌ Cancelado";
    default: return estado;
  }
};

export const estadoPedidoCorto = textoEstadoPedido;
