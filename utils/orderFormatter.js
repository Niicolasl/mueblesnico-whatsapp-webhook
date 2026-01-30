/**
 * Formatea información completa del pedido para mensajes al cliente
 */

/**
 * Formato: "MN-2026-0008 - Comedor 6 puestos"
 */
export const formatOrderInline = (orderCode, descripcionTrabajo) => {
    if (!descripcionTrabajo || descripcionTrabajo.trim() === '') {
        return orderCode;
    }
    return `${orderCode} - ${descripcionTrabajo}`;
};

/**
 * Formato completo con emojis en líneas separadas
 */
export const formatOrderHeader = (orderCode, descripcionTrabajo, valorTotal = null) => {
    let header = `📦 Pedido: ${orderCode}\n🛠️ Trabajo: ${descripcionTrabajo || 'Sin descripción'}`;

    if (valorTotal !== null) {
        header += `\n💰 Valor total: $${Number(valorTotal).toLocaleString()}`;
    }

    return header;
};