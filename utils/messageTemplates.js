export const menuPrincipal = () => ({
  messaging_product: "whatsapp",
  type: "interactive",
  interactive: {
    type: "button",
    body: {
      text: "👋 *¡Bienvenido al menú de Muebles Nico!*\n\nSelecciona una opción:"
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "COTIZAR", title: "📝 Cotizar" } },
        { type: "reply", reply: { id: "SALDO", title: "💰 Consultar / Abonar saldo" } },
        { type: "reply", reply: { id: "GARANTIA", title: "🛠 Garantía" } },
        { type: "reply", reply: { id: "TIEMPOS", title: "⏳ Tiempos de entrega" } },
        { type: "reply", reply: { id: "PEDIDO", title: "📦 Preguntar por mi pedido" } }
      ]
    }
  }
});

// --- PREGUNTAR POR MI PEDIDO ---

export const noTienePedidos = () => ({
  messaging_product: "whatsapp",
  text: {
    body: "🔎 No encontramos pedidos activos asociados a este número.\n\nSi deseas crear alguno, selecciona *📝 Cotizar* en el menú."
  }
});


export const seleccionarPedido = (orders) => ({
  messaging_product: "whatsapp",
  type: "interactive",
  interactive: {
    type: "list",
    header: {
      type: "text",
      text: "📦 Tus pedidos"
    },
    body: {
      text: "Selecciona el pedido del que deseas obtener información:"
    },
    action: {
      sections: [
        {
          title: "Pedidos activos",
          rows: orders.map(o => ({
            id: `PEDIDO_${o.id}`,
            title: `${o.order_code}`,
            description: o.descripcion_trabajo.substring(0, 50)
          }))
        }
      ]
    }
  }
});

// --- MENSAJE INICIAL DE CONSULTA DE SALDO ---
export const pedirDatoSaldo = () => ({
  messaging_product: "whatsapp",
  text: {
    body:
      "💰 *Consulta de saldo*\n\n" +
      "Por favor escribe uno de los siguientes datos:\n\n" +
      "• ID del pedido (ej: *123*)\n" +
      "• Código del pedido (ej: *MN-240*)\n" +
      "• Tu número de WhatsApp (sin +)\n\n" +
      "Ejemplos:\n" +
      "👉 124\n" +
      "👉 MN-122\n" +
      "👉 573204128555"
  }
});

// --- SIN PEDIDOS O NO ENCONTRADOS ---
export const saldoNoEncontrado = () => ({
  messaging_product: "whatsapp",
  text: {
    body:
      "❌ No encontramos pedidos activos con ese dato.\n\n" +
      "Verifica que lo hayas escrito correctamente.\n\n" +
      "Escribe */menu* para regresar al inicio."
  }
});

// --- UN SOLO PEDIDO: MOSTRAR SALDO ---
export const saldoUnPedido = (order) => ({
  messaging_product: "whatsapp",
  text: {
    body:
      `💰 *Saldo de tu pedido ${order.codigo}*\n\n` +
      `• Trabajo: ${order.descripcion}\n` +
      `• Total: $${order.total}\n` +
      `• Abonado: $${order.anticipo}\n` +
      `• Saldo pendiente: *$${order.saldo}*\n\n` +
      `Si deseas abonar escribe *ABONAR ${order.id}*.\n\n` +
      `Escribe */menu* para regresar.`
  }
});

// --- VARIOS PEDIDOS: LISTA PARA SELECCIONAR ---
export const seleccionarPedidoSaldo = (orders) => ({
  messaging_product: "whatsapp",
  type: "interactive",
  interactive: {
    type: "list",
    header: {
      type: "text",
      text: "💰 Tus saldos"
    },
    body: {
      text: "Selecciona el pedido del que deseas ver el saldo:"
    },
    action: {
      sections: [
        {
          title: "Pedidos activos",
          rows: orders.map(o => ({
            id: `SALDO_${o.id}`,
            title: `${o.codigo}`,
            description: `Saldo pendiente: $${o.total - o.anticipo}`
          }))
        }
      ]
    }
  }
});

// --- CONFIRMAR SI QUIERE ABONAR ---
export const solicitarAbono = (order) => ({
  messaging_product: "whatsapp",
  text: {
    body:
      `💵 *Abonar a tu pedido ${order.codigo}*\n\n` +
      `Saldo pendiente: *$${order.total - order.anticipo}*\n\n` +
      `Por favor escribe el valor que deseas abonar.\n\n` +
      `Ejemplo: *350000*`
  }
});

export const listaPedidosTemplate = (pedidos) => {
  return {
    messaging_product: "whatsapp",
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "📦 Tus Pedidos" },
      body: { text: "Selecciona el pedido que deseas consultar:" },
      footer: { text: "Muebles Nico • Consulta de pedidos" },
      action: {
        button: "Ver pedidos",
        sections: [
          {
            title: "Pedidos disponibles",
            rows: pedidos.map((p) => ({
              id: `PEDIDO_${p.id}`,   // IMPORTANTE → combina con tu whatsappService.js
              title: p.order_code,
              description: `${p.estado_pedido} • Saldo: ${Number(p.saldo_pendiente).toLocaleString()}`
            }))
          }
        ]
      }
    }
  };
};

export const infoPedidoUnico = (pedido) => ({
  messaging_product: "whatsapp",
  type: "text",
  text: {
    body:
      `📦 Detalles de tu pedido ${pedido.order_code}

• Estado: ${pedido.estado_pedido}
• Valor total: ${Number(pedido.valor_total).toLocaleString()}
• Abonado: ${Number(pedido.valor_abonado).toLocaleString()}
• Saldo pendiente: ${Number(pedido.saldo_pendiente).toLocaleString()}
${pedido.fecha_aprox_entrega ? `• Entrega estimada: ${pedido.fecha_aprox_entrega}` : ""}
`
  }
});

