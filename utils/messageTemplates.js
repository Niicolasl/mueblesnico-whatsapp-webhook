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
// --- PREGUNTAR POR MI PEDIDO ---

export const noTienePedidos = () => ({
  text: {
    body: "🔎 No encontramos pedidos activos asociados a este número.\n\nSi deseas crear alguno, selecciona *📝 Cotizar* en el menú."
  }
});


export const seleccionarPedido = (orders) => ({
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
      button: "Seleccionar pedido",
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
  text: {
    body:
      "❌ No encontramos pedidos activos con ese dato.\n\n" +
      "Verifica que lo hayas escrito correctamente.\n\n" +
      "Escribe */menu* para regresar al inicio."
  }
});

// --- UN SOLO PEDIDO: MOSTRAR SALDO ---
export const saldoUnPedido = (order) => ({
  interactive: {
    type: "button",
    body: {
      text:
        `💰 *Saldo de tu pedido ${order.codigo}*\n\n` +
        `📦 Trabajo: ${order.descripcion}\n` +
        `⚖ Total: $${order.total.toLocaleString()}\n` +
        `💵 Abonado: $${order.anticipo.toLocaleString()}\n` +
        `🔻 Saldo pendiente: *$${order.saldo.toLocaleString()}*`
    },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "ABONAR",
            title: "💵 Abonar"
          }
        },
        {
          type: "reply",
          reply: {
            id: "MENU",
            title: "📋 Volver al menú"
          }
        }
      ]
    }
  }
});



// --- VARIOS PEDIDOS: LISTA PARA SELECCIONAR ---
export const seleccionarPedidoSaldo = (orders) => ({
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
      button: "Ver pedidos",
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


export const estadoPedidoTemplate = (pedido) => {
  const fechaEntrega = pedido.fecha_aprox_entrega
    ? `📅 *Entrega estimada:* ${pedido.fecha_aprox_entrega}\n`
    : "";

  return {
    text: {
      body:
        `📦 *Estado de tu pedido*\n\n` +
        `🆔 Código: *${pedido.order_code}*\n` +
        `📌 Estado: *${textoEstadoPedido(pedido)}*\n\n` +
        fechaEntrega +
        `\nEscribe *MENU* para volver al inicio.`
    }
  };
};


export const infoMediosPago = () => ({
  text: {
    body:
      "💵 *Medios de pago disponibles*\n\n" +
      "• Nequi: 3125906313\n" +
      "• Daviplata: 3125906313\n" +
      "• Bancolombia:941-000017-43 cuenta ahorros\n" +
      "Daniel Perez Rodriguez\n" +
      "CC 79977638\n\n"+
      "📸 Cuando realices el pago, envía el comprobante y un asesor lo registrará."
  }
});

export const textoEstadoPedido = (pedido) => {
  // 🧠 Estado legible
  let estadoTexto = "";

  switch (pedido.estado_pedido) {
    case "nuevo":
      estadoTexto = "📝 Pedido registrado";
      break;

    case "pendiente de anticipo":
      estadoTexto = "⏳ Pendiente de anticipo";
      break;

    case "pendiente de inicio":
      estadoTexto = "🛠️ En proceso de fabricación";
      break;

    case "pagado":
      estadoTexto = "🎉 Pago completo recibido";
      break;

    case "CANCELADO":
    case "cancelado":
      estadoTexto = "❌ Pedido cancelado";
      break;

    default:
      estadoTexto = pedido.estado_pedido;
  }

  // 📅 Entrega estimada
  let entregaTexto = "⏳ Se definirá al iniciar el pedido";

  if (pedido.fecha_aprox_entrega) {
    const fecha = new Date(pedido.fecha_aprox_entrega);
    entregaTexto = `📅 ${fecha.toLocaleDateString("es-CO")}`;
  }

  // 📦 Mensaje final
  return {
    text: {
      body:
        `📦 *Estado de tu pedido*\n\n` +
        `Código: *${pedido.order_code}*\n` +
        `Estado: *${estadoTexto}*\n` +
        `Entrega estimada: *${entregaTexto}*`
    }
  };
};



export const seleccionarPedidoEstado = (pedidos) => ({
  type: "interactive",
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

export const estadoPedidoCorto = (estado) => {
  switch (estado) {
    case "nuevo":
      return "📝 Registrado";

    case "pendiente de anticipo":
      return "⏳ Pendiente de anticipo";

    case "pendiente de inicio":
      return "🛠️ En fabricación";

    case "pagado":
      return "🎉 Pagado";

    case "CANCELADO":
    case "cancelado":
      return "❌ Cancelado";

    default:
      return estado;
  }
};


