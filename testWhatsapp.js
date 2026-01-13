import { sendMessage } from "./services/whatsappSender.js";
import 'dotenv/config';

const numeroPrueba = process.env.TEST_WHATSAPP_NUMBER || "573204128555"; // tu número de prueba

(async () => {
    console.log("🔹 Probando envío de mensaje de texto...");

    try {
        const respTexto = await sendMessage(numeroPrueba, {
            text: {
                body: "✅ Este es un mensaje de prueba desde WhatsApp Cloud API"
            }
        });

        if (respTexto) {
            console.log("✅ Mensaje de texto enviado correctamente!");
        }
    } catch (err) {
        console.error("❌ Error al enviar mensaje de texto:", err);
    }

    console.log("🔹 Probando envío de mensaje interactivo (botones)...");

    try {
        const respInteractivo = await sendMessage(numeroPrueba, {
            interactive: {
                type: "button",
                body: {
                    text: "¿Todo funciona bien?"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "boton_si",
                                title: "Sí"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "boton_no",
                                title: "No"
                            }
                        }
                    ]
                }
            }
        });

        if (respInteractivo) {
            console.log("✅ Mensaje interactivo enviado correctamente!");
        }
    } catch (err) {
        console.error("❌ Error al enviar mensaje interactivo:", err);
    }

    console.log("🔹 Prueba completada.");
})();
