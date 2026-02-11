import { pool } from './init.js';


/**
 * Registrar un abono a una orden de proveedor
 */
export async function registrarAbonoProveedor(orderCode, montoAbono) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Obtener la orden actual
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
            throw new Error('No se puede abonar a una orden cancelada');
        }

        if (orden.completado) {
            throw new Error('Esta orden ya está completada');
        }

        if (montoAbono <= 0) {
            throw new Error('El monto del abono debe ser mayor a cero');
        }

        if (montoAbono > orden.saldo_pendiente) {
            throw new Error(`El abono ($${montoAbono.toLocaleString()}) excede el saldo pendiente ($${orden.saldo_pendiente.toLocaleString()})`);
        }

        // Calcular nuevos valores
        const nuevoAbonado = parseFloat(orden.valor_abonado) + parseFloat(montoAbono);
        const nuevoSaldo = parseFloat(orden.saldo_pendiente) - parseFloat(montoAbono);

        // Actualizar la orden
        const updateResult = await client.query(
            `UPDATE supplier_orders 
       SET valor_abonado = $1, saldo_pendiente = $2 
       WHERE order_code = $3 
       RETURNING *`,
            [nuevoAbonado, nuevoSaldo, orderCode.trim().toUpperCase()]
        );

        await client.query('COMMIT');

        return {
            orden: updateResult.rows[0],
            supplierName: orden.supplier_name,
            supplierPhone: orden.supplier_phone,
            montoAbono: parseFloat(montoAbono),
            nuevoAbonado,
            nuevoSaldo
        };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error registrando abono a proveedor:', error);
        throw error;
    } finally {
        client.release();
    }
}