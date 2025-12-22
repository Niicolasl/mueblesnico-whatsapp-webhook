
import { getPedidosByPhone } from "../db/orders.js";
import { estadoPedidoTemplate, seleccionarPedidoEstado } 
from "../utils/messageTemplates.js";


export const consultarPedido = async (from) => {
    try {
        const pedidos = await getPedidosByPhone(from);

        // No tiene pedidos
        if (!pedidos || pedidos.length === 0) {
            return {
                messaging_product: "whatsapp",
                text: { body: "📭 No encontramos pedidos asociados a este número." }
            };
        }

        // Solo un pedido → enviar información directa
        if (pedidos.length === 1) {
            return estadoPedidoTemplate(pedidos[0]);
        }

        // Varios pedidos → enviar lista interactiva
        return seleccionarPedidoEstado(pedidos);

    } catch (err) {
        console.error("Error consultando pedido:", err);
        return {
            messaging_product: "whatsapp",
            text: { body: "❌ Error al consultar tus pedidos. Inténtalo nuevamente." }
        };
    }
};
