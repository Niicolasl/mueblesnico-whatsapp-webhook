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

import { startNewOrderFlow, handleNewOrderStep, newOrderState } from "./flows/newOrderFlow.js";

function manejarComandosAdmin(from, message) {
  message = message.trim().toLowerCase();

  // Si está en medio del flujo /nuevo_pedido
  if (newOrderState[from]) {
    handleNewOrderStep(from, message);
    return;
  }

  // Iniciar flujo de nuevo pedido
  if (message === "/nuevo_pedido") {
    startNewOrderFlow(from);
    return;
  }

  console.log("Comando admin recibido:", message);
}


function manejarMensajesCliente(from, message) {
  console.log("Mensaje cliente:", message);

  // Ejemplo: aquí va la palabra "menu"
}
