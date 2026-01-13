import {telefonoParaWhatsApp } from "../utils/phone.js";
import { sendMessage } from "../services/whatsappSender.js";


// ✅ Número de prueba (el tuyo, en E.164 sin +)
const numeroPrueba = telefonoParaWhatsApp("3204128555"); // reemplaza con tu número

async function test() {
    try {
        console.log("🔹 Probando envío de mensaje de texto...");
        await sendMessage(numeroPrueba, {
            text: { body: "✅ Este es un mensaje de prueba desde WhatsApp Cloud API" },
        });

        console.log("🔹 Probando envío de mensaje interactivo (botón)...");
        await sendMessage(numeroPrueba, {
            interactive: {
                type: "button",
                body: { text: "¿Todo funciona bien?" },
                action: {
                    buttons: [
                        { type: "reply", reply: { id: "boton_si", title: "Sí" } },
                        { type: "reply", reply: { id: "boton_no", title: "No" } },
                    ],
                },
            },
        });

        console.log("✅ Prueba completada, revisa WhatsApp del número.");
    } catch (err) {
        console.error("❌ Error en la prueba:", err);
    }
}

test();