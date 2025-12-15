import { consultarPedido } from "./orderService.js";
import { consultarSaldo } from "../db/consultarSaldo.js";
import { cancelarPedido } from "../db/cancelarPedido.js";
import { registrarAnticipo } from "../db/anticipo.js";

import {
  startNewOrderFlow,
  handleNewOrderStep,
  newOrderState
} from "../flows/newOrderFlow.js";

import {
  pedirDatoSaldo,
  saldoNoEncontrado,
  saldoUnPedido,
  seleccionarPedidoSaldo,
  menuPrincipal,
} from "../utils/messageTemplates.js";

import { sendMessage } from "./whatsappSender.js";

const ADMINS = [
  "573204128555",
  "573125906313"
];

export const handleMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;

    console.log("📩 MENSAJE RECIBIDO DESDE:", from);
    console.log("📦 MENSAJE RAW:", JSON.stringify(message, null, 2));

    await sendMessage(from, {
      type: "text",
      text: {
        body: "✅ RESPUESTA DE PRUEBA DIRECTA\n\nSi lees esto, WhatsApp SÍ está funcionando."
      }
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ ERROR GLOBAL:", err);
    return res.sendStatus(500);
  }
};
