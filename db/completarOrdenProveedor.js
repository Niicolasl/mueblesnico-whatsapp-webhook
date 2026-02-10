import pool from './init.js';

/**
 * Completar una orden de proveedor
 */
export async function completarOrdenProveedor(orderCode) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Obtener la orden
        const orderResult = await client.query(
            `SELECT so.*, s.name as supplier_name, s.phone as supplier_phone
       FROM supplier_orders so
       JOIN suppliers s ON so.supplier_id = s.id
       WHERE so.order_code = $1`,
            [orderCode.trim().toUpperCase()]
        );

        if (orderResult.rows.length === 0) {
            throw new Error('Orden no encontrada');
        }

        const orden = orderResult.rows[0];

        // Validaciones
        if (orden.cancelado) {
            throw new Error('No se puede completar una orden cancelada');
        }

        if (orden.completado) {
            throw new Error('Esta orden ya está completada');
        }

        if (parseFloat(orden.saldo_pendiente) > 0) {
            throw new Error(`No se puede completar. Aún hay un saldo pendiente de $${parseFloat(orden.saldo_pendiente).toLocaleString()}`);
        }

        // Marcar como completado
        const updateResult = await client.query(
            `UPDATE supplier_orders 
       SET completado = TRUE, 
           estado = 'COMPLETADO',
           fecha_completado = CURRENT_DATE
       WHERE order_code = $1 
       RETURNING *`,
            [orderCode.trim().toUpperCase()]
        );

        await client.query('COMMIT');

        return {
            orden: updateResult.rows[0],
            supplierName: orden.supplier_name,
            supplierPhone: orden.supplier_phone
        };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error completando orden de proveedor:', error);
        throw error;
    } finally {
        client.release();
    }
}