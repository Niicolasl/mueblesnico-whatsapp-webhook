/**
 * Plantillas de mensajes para proveedores
 */

/**
 * Formato de fecha DD/MM/YYYY
 */
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Resumen de consulta de proveedor
 */
export function formatSupplierConsultation(supplier, orders, summary) {
    let mensaje = `👷 *ÓRDENES DE ${supplier.name.toUpperCase()}*\n`;
    mensaje += `📱 ${supplier.phone}\n\n`;

    if (orders.length === 0) {
        mensaje += '📭 No hay órdenes registradas para este proveedor';
        return mensaje;
    }

    // Agrupar por estado
    const enProceso = orders.filter(o => o.estado === 'EN_PROCESO' && !o.cancelado);
    const completadas = orders.filter(o => o.estado === 'COMPLETADO');
    const canceladas = orders.filter(o => o.estado === 'CANCELADO');

    // Órdenes en proceso
    if (enProceso.length > 0) {
        mensaje += `🔵 *ÓRDENES EN PROCESO* (${enProceso.length})\n`;
        mensaje += '━━━━━━━━━━━━━━━━━━\n';

        enProceso.forEach(orden => {
            mensaje += `\n📦 *${orden.order_code}*\n`;
            mensaje += `🛠️ ${orden.descripcion_trabajo}\n`;
            mensaje += `💰 Total: $${parseFloat(orden.valor_total).toLocaleString()}\n`;
            mensaje += `💵 Abonado: $${parseFloat(orden.valor_abonado).toLocaleString()}\n`;
            mensaje += `📊 Saldo: $${parseFloat(orden.saldo_pendiente).toLocaleString()}\n`;
            mensaje += `📅 Creado: ${formatDate(orden.fecha_creacion)}\n`;
        });
        mensaje += '\n';
    }

    // Órdenes completadas
    if (completadas.length > 0) {
        mensaje += `✅ *ÓRDENES COMPLETADAS* (${completadas.length})\n`;
        mensaje += '━━━━━━━━━━━━━━━━━━\n';

        completadas.forEach(orden => {
            mensaje += `\n📦 *${orden.order_code}*\n`;
            mensaje += `🛠️ ${orden.descripcion_trabajo}\n`;
            mensaje += `💰 Pagado: $${parseFloat(orden.valor_total).toLocaleString()} ✅\n`;
            mensaje += `📅 Completado: ${formatDate(orden.fecha_completado)}\n`;
        });
        mensaje += '\n';
    }

    // Órdenes canceladas
    if (canceladas.length > 0) {
        mensaje += `❌ *ÓRDENES CANCELADAS* (${canceladas.length})\n`;
        mensaje += '━━━━━━━━━━━━━━━━━━\n';

        canceladas.forEach(orden => {
            mensaje += `\n📦 *${orden.order_code}*\n`;
            mensaje += `🛠️ ${orden.descripcion_trabajo}\n`;
            mensaje += `💰 Abonado: $${parseFloat(orden.valor_abonado).toLocaleString()}\n`;
            mensaje += `📅 Cancelado: ${formatDate(orden.fecha_cancelacion)}\n`;
        });
        mensaje += '\n';
    }

    // Resumen financiero
    mensaje += '━━━━━━━━━━━━━━━━━━\n';
    mensaje += `📊 *RESUMEN FINANCIERO*\n\n`;
    mensaje += `• Órdenes activas: ${summary.ordenes_activas || 0}\n`;
    mensaje += `• Deuda total: $${parseFloat(summary.deuda_total || 0).toLocaleString()}\n`;
    mensaje += `• Total pagado histórico: $${parseFloat(summary.total_pagado_historico || 0).toLocaleString()}\n`;

    return mensaje;
}

/**
 * Mensaje de orden no encontrada
 */
export function orderNotFound(orderCode) {
    return `❌ No se encontró la orden *${orderCode}*\n\nVerifica el código e intenta nuevamente`;
}

/**
 * Mensaje de proveedor no encontrado
 */
export function supplierNotFound(phone) {
    return `❌ No se encontró ningún proveedor con el número *${phone}*\n\nVerifica el número e intenta nuevamente`;
}