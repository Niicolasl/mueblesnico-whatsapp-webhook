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

export function formatPedidosActivos(pedidos) {
  if (!pedidos || pedidos.length === 0) {
    return '📭 No hay pedidos activos en este momento.';
  }

  // Agrupar por estado
  const porEstado = {
    'pendiente de anticipo': [],
    'EN_FABRICACION': [],
    'LISTO': [],
    'ENTREGADO': [],
    'PAGADO': []
  };

  pedidos.forEach(pedido => {
    const estado = pedido.estado_pedido;

    if (estado === 'pendiente de anticipo') {
      porEstado['pendiente de anticipo'].push(pedido);
    } else if (estado === 'EN_FABRICACION' || estado === 'pendiente de inicio') {
      porEstado['EN_FABRICACION'].push(pedido);
    } else if (estado === 'LISTO') {
      porEstado['LISTO'].push(pedido);
    } else if (estado === 'ENTREGADO') {
      porEstado['ENTREGADO'].push(pedido);
    } else if (estado === 'PAGADO') {
      porEstado['PAGADO'].push(pedido);
    }
  });

  let mensaje = `📋 *PEDIDOS ACTIVOS* (${pedidos.length})\n\n`;

  // 🟡 PENDIENTE DE ANTICIPO
  if (porEstado['pendiente de anticipo'].length > 0) {
    mensaje += `🟡 *PENDIENTE DE ANTICIPO* (${porEstado['pendiente de anticipo'].length})\n`;
    mensaje += '━━━━━━━━━━━━━━━━━━\n';

    porEstado['pendiente de anticipo'].forEach(p => {
      mensaje += `\n${p.order_code} | ${p.nombre_cliente}\n`;
      mensaje += `🛠️ ${p.descripcion_trabajo}\n`;
      mensaje += `💰 Saldo: $${parseFloat(p.saldo_pendiente).toLocaleString()}\n`;
    });
    mensaje += '\n';
  }

  // 🔵 EN FABRICACIÓN
  if (porEstado['EN_FABRICACION'].length > 0) {
    mensaje += `🔵 *EN FABRICACIÓN* (${porEstado['EN_FABRICACION'].length})\n`;
    mensaje += '━━━━━━━━━━━━━━━━━━\n';

    porEstado['EN_FABRICACION'].forEach(p => {
      mensaje += `\n${p.order_code} | ${p.nombre_cliente}\n`;
      mensaje += `🛠️ ${p.descripcion_trabajo}\n`;
      mensaje += `💰 Saldo: $${parseFloat(p.saldo_pendiente).toLocaleString()}\n`;
    });
    mensaje += '\n';
  }

  // ✅ LISTO
  if (porEstado['LISTO'].length > 0) {
    mensaje += `✅ *LISTO PARA ENTREGA* (${porEstado['LISTO'].length})\n`;
    mensaje += '━━━━━━━━━━━━━━━━━━\n';

    porEstado['LISTO'].forEach(p => {
      mensaje += `\n${p.order_code} | ${p.nombre_cliente}\n`;
      mensaje += `🛠️ ${p.descripcion_trabajo}\n`;

      if (parseFloat(p.saldo_pendiente) > 0) {
        mensaje += `💰 Saldo: $${parseFloat(p.saldo_pendiente).toLocaleString()}\n`;
      } else {
        mensaje += `✅ Pagado totalmente\n`;
      }
    });
    mensaje += '\n';
  }

  // 🚚 ENTREGADO (pero con saldo pendiente)
  if (porEstado['ENTREGADO'].length > 0) {
    mensaje += `🚚 *ENTREGADO - SALDO PENDIENTE* (${porEstado['ENTREGADO'].length})\n`;
    mensaje += '━━━━━━━━━━━━━━━━━━\n';

    porEstado['ENTREGADO'].forEach(p => {
      mensaje += `\n${p.order_code} | ${p.nombre_cliente}\n`;
      mensaje += `🛠️ ${p.descripcion_trabajo}\n`;
      mensaje += `💰 Saldo: $${parseFloat(p.saldo_pendiente).toLocaleString()}\n`;
    });
    mensaje += '\n';
  }

  // 💚 PAGADO (pero no entregado)
  if (porEstado['PAGADO'].length > 0) {
    mensaje += `💚 *PAGADO - PENDIENTE ENTREGA* (${porEstado['PAGADO'].length})\n`;
    mensaje += '━━━━━━━━━━━━━━━━━━\n';

    porEstado['PAGADO'].forEach(p => {
      mensaje += `\n${p.order_code} | ${p.nombre_cliente}\n`;
      mensaje += `🛠️ ${p.descripcion_trabajo}\n`;
      mensaje += `✅ Pagado totalmente\n`;
    });
  }

  return mensaje.trim();
}

/**
 * Formatear pedidos de un cliente específico
 */
export function formatPedidosCliente(pedidos, telefono) {
  if (!pedidos || pedidos.length === 0) {
    return `📭 No hay pedidos activos para el número *${telefono}*`;
  }

  const cliente = pedidos[0].nombre_cliente;

  let mensaje = `👤 *PEDIDOS DE ${cliente.toUpperCase()}*\n`;
  mensaje += `📱 ${telefono}\n\n`;
  mensaje += `📦 *${pedidos.length} pedido(s) activo(s)*\n`;
  mensaje += '━━━━━━━━━━━━━━━━━━\n';

  pedidos.forEach((p, index) => {
    const estadoEmoji = {
      'pendiente de anticipo': '🟡',
      'EN_FABRICACION': '🔵',
      'pendiente de inicio': '🔵',
      'LISTO': '✅',
      'PAGADO': '💚',
      'ENTREGADO': '✅'
    };

    const emoji = estadoEmoji[p.estado_pedido] || '📦';
    const estadoTexto = p.estado_pedido === 'pendiente de anticipo'
      ? 'Pendiente anticipo'
      : p.estado_pedido.replace('_', ' ');

    mensaje += `\n${emoji} *${p.order_code}*\n`;
    mensaje += `🛠️ ${p.descripcion_trabajo}\n`;
    mensaje += `📌 Estado: ${estadoTexto}\n`;
    mensaje += `💰 Total: $${parseFloat(p.valor_total).toLocaleString()}\n`;
    mensaje += `💵 Abonado: $${parseFloat(p.valor_abonado).toLocaleString()}\n`;

    if (parseFloat(p.saldo_pendiente) > 0) {
      mensaje += `📊 Saldo: $${parseFloat(p.saldo_pendiente).toLocaleString()}\n`;
    } else {
      mensaje += `✅ Pagado totalmente\n`;
    }

    if (index < pedidos.length - 1) {
      mensaje += '\n━━━━━━━━━━━━━━━━━━\n';
    }
  });

  return mensaje;
}

/**
 * Mensaje cuando no se encuentra el pedido/cliente
 */
export function pedidoNoEncontrado(busqueda) {
  return `❌ No se encontraron pedidos activos para: *${busqueda}*`;
}

/* =====================================================
   🧠 HELPERS
===================================================== */
export const textoEstadoPedido = (estado) => {
  switch (estado) {
    case "pendiente de anticipo":
      return "⏳ Pendiente de anticipo";
    case "pendiente de inicio":
      return "🛠️ En fabricación";
    case "PAGADO":
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