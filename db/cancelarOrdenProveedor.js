import pool from './init.js';

/**
 * Cancelar una orden de proveedor
 */
export async function cancelarOrdenProveedor(orderCode) {
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
            throw new Error('Esta orden ya está cancelada');
        }

        if (orden.completado) {
            throw new Error('No se puede cancelar una orden completada');
        }

        // Marcar como cancelado
        const updateResult = await client.query(
            `UPDATE supplier_orders 
       SET cancelado = TRUE, 
           estado = 'CANCELADO',
           fecha_cancelacion = CURRENT_DATE
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
        console.error('Error cancelando orden de proveedor:', error);
        throw error;
    } finally {
        client.release();
    }
}