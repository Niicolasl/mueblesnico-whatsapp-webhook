import express from "express";
import { initDatabase } from "./db/init.js";

initDatabase();

const ADMINS = [
  "573204128555",
  "573125906313",
];
const app = express();
app.use(express.json());

// *** VERIFICATION TOKEN (inventado por ti) ***
const VERIFY_TOKEN = "mueblesnico_token_123";

// *** WEBHOOK GET (verificación con Meta) ***
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verificado ✔");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
});

// *** WEBHOOK POST (mensajes de WhatsApp que llegan) ***
app.post("/webhook", async (req, res) => {
  const data = req.body;

  try {
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from; // número del remitente
    const text = message.text?.body || "";

    // 🔹 Detectar si es ADMIN
    if (ADMINS.includes(from)) {
      console.log("Administrador detectado:", from);
      manejarComandosAdmin(from, text);
    } else {
      console.log("Cliente detectado:", from);
      manejarMensajesCliente(from, text);
    }

    return res.sendStatus(200);

  } catch (error) {
    console.error("Error handling webhook:", error);
    return res.sendStatus(500);
  }
});

// Puerto Render (usa variable automática)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});


import { cancelarPedido } from "./db/cancelarPedido.js";
import { sendMessage } from "./services/whatsappSender.js";
import { startNewOrderFlow, handleNewOrderStep, newOrderState } from "./flows/newOrderFlow.js";
import { registrarAnticipo } from "./db/anticipo.js";

function manejarComandosAdmin(from, message) {
  message = message.trim().toLowerCase();

  // Si el admin está en el flujo de /nuevo_pedido
  if (newOrderState[from]) {
    handleNewOrderStep(from, message);
    return;
  }

  // ------------------------
  // /nuevo_pedido
  // ------------------------
  if (message === "/nuevo_pedido") {
    startNewOrderFlow(from);
    return;
  }

  // ------------------------
  // /anticipo MN-xxxx 200000
  // ------------------------
  if (message.startsWith("/anticipo")) {
    manejarAnticipo(from, message);
    return;
  }


  async function manejarCancelacion(from, message) {
    const parts = message.split(" ");

    if (parts.length < 2) {
      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: { body: "❌ Formato incorrecto.\nUsa:\n/cancelar_pedido MN-2025-0003" }
      });
      return;
    }

    const orderCode = parts[1].toUpperCase();

    const result = await cancelarPedido(orderCode);

    // Pedido no existe
    if (result.status === "not_found") {
      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: { body: `❌ No existe ningún pedido con el código *${orderCode}*.` }
      });
      return;
    }

    // Pedido ya estaba cancelado
    if (result.status === "already_cancelled") {
      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: { body: `⚠️ El pedido *${orderCode}* ya había sido cancelado previamente.` }
      });
      return;
    }

    // Cancelación exitosa
    if (result.status === "ok") {
      const order = result.order;

      await sendMessage(from, {
        messaging_product: "whatsapp",
        text: {
          body:
            `🟥 *Pedido cancelado correctamente*

📦 Código: *${order.order_code}*
👤 Cliente: ${order.nombre_cliente}

📅 Fecha de cancelación: ${order.fecha_cancelacion}

El pedido se mantiene en la base de datos para historial, pero queda marcado definitivamente como *cancelado*.`
        }
      });

      return;
    }

    // Error inesperado
    await sendMessage(from, {
      messaging_product: "whatsapp",
      text: { body: "❌ Ocurrió un error al cancelar el pedido." }
    });
  }

  console.log("Comando admin recibido:", message);
}

async function manejarAnticipo(from, message) {
  const parts = message.split(" ");

  if (parts.length < 3) {
    await sendMessage(from, {
      messaging_product: "whatsapp",
      text: { body: "❌ Formato incorrecto.\nUsa:\n/anticipo MN-2025-0003 200000" }
    });
    return;
  }

  const orderCode = parts[1].toUpperCase();
  const valor = Number(parts[2].replace(/\D/g, ""));

  const order = await registrarAnticipo(orderCode, valor);

  if (!order) {
    await sendMessage(from, {
      messaging_product: "whatsapp",
      text: { body: "❌ No se encontró el pedido o está cancelado." }
    });
    return;
  }

  // Respuesta al admin
  await sendMessage(from, {
    messaging_product: "whatsapp",
    text: {
      body:
        `✅ *Anticipo registrado*  

📌 Pedido: *${order.order_code}*
👤 Cliente: ${order.nombre_cliente}

💰 Valor total: ${Number(order.valor_total).toLocaleString()}
💵 Abonado: ${Number(order.valor_abonado).toLocaleString()}
📉 Saldo: ${Number(order.saldo_pendiente).toLocaleString()}

📅 Fecha aproximada de entrega: ${order.fecha_aprox_entrega}

🟢 Estado actualizado a: *pendiente de inicio*`
    }
  });
}



function manejarMensajesCliente(from, message) {
  console.log("Mensaje cliente:", message);

  // Ejemplo: aquí va la palabra "menu"
}
