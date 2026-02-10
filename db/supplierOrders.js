const pool = require('./init');

/**
 * Generar código de orden para proveedor (PROV-2026-0001)
 */
async function generateSupplierOrderCode() {
    try {
        const year = new Date().getFullYear();

        const result = await pool.query(
            `SELECT order_code FROM supplier_orders 
       WHERE order_code LIKE $1 
       ORDER BY order_code DESC 
       LIMIT 1`,
            [`PROV-${year}-%`]
        );

        if (result.rows.length === 0) {
            return `PROV-${year}-0001`;
        }

        const lastCode = result.rows[0].order_code;
        const lastNumber = parseInt(lastCode.split('-')[2]);
        const newNumber = (lastNumber + 1).toString().padStart(4, '0');

        return `PROV-${year}-${newNumber}`;
    } catch (error) {
        console.error('Error generando código de orden:', error);
        throw error;
    }
}

/**
 * Crear nueva orden a proveedor
 */
async function createSupplierOrder(supplierId, descripcionTrabajo, valorTotal) {
    try {
        const orderCode = await generateSupplierOrderCode();

        const result = await pool.query(
            `INSERT INTO supplier_orders 
       (order_code, supplier_id, descripcion_trabajo, valor_total, saldo_pendiente, estado) 
       VALUES ($1, $2, $3, $4, $5, 'EN_PROCESO') 
       RETURNING *`,
            [orderCode, supplierId, descripcionTrabajo, valorTotal, valorTotal]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error creando orden a proveedor:', error);
        throw error;
    }
}

/**
 * Buscar orden por código
 */
async function findSupplierOrderByCode(orderCode) {
    try {
        const result = await pool.query(
            `SELECT so.*, s.name as supplier_name, s.phone as supplier_phone
       FROM supplier_orders so
       JOIN suppliers s ON so.supplier_id = s.id
       WHERE so.order_code = $1`,
            [orderCode.trim().toUpperCase()]
        );

        return result.rows[0] || null;
    } catch (error) {
        console.error('Error buscando orden:', error);
        throw error;
    }
}

/**
 * Obtener todas las órdenes de un proveedor
 */
async function getSupplierOrders(supplierId) {
    try {
        const result = await pool.query(
            `SELECT * FROM supplier_orders 
       WHERE supplier_id = $1 
       ORDER BY fecha_creacion DESC`,
            [supplierId]
        );

        return result.rows;
    } catch (error) {
        console.error('Error obteniendo órdenes del proveedor:', error);
        throw error;
    }
}

/**
 * Obtener órdenes activas (EN_PROCESO)
 */
async function getActiveSupplierOrders(supplierId) {
    try {
        const result = await pool.query(
            `SELECT * FROM supplier_orders 
       WHERE supplier_id = $1 
       AND estado = 'EN_PROCESO' 
       AND cancelado = FALSE
       ORDER BY fecha_creacion DESC`,
            [supplierId]
        );

        return result.rows;
    } catch (error) {
        console.error('Error obteniendo órdenes activas:', error);
        throw error;
    }
}

/**
 * Calcular resumen financiero del proveedor
 */
async function getSupplierFinancialSummary(supplierId) {
    try {
        const result = await pool.query(
            `SELECT 
        COUNT(*) FILTER (WHERE estado = 'EN_PROCESO' AND cancelado = FALSE) as ordenes_activas,
        COALESCE(SUM(saldo_pendiente) FILTER (WHERE estado = 'EN_PROCESO' AND cancelado = FALSE), 0) as deuda_total,
        COALESCE(SUM(valor_abonado), 0) as total_pagado_historico,
        COALESCE(SUM(valor_total) FILTER (WHERE completado = TRUE), 0) as total_completado
       FROM supplier_orders 
       WHERE supplier_id = $1`,
            [supplierId]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error calculando resumen financiero:', error);
        throw error;
    }
}

module.exports = {
    generateSupplierOrderCode,
    createSupplierOrder,
    findSupplierOrderByCode,
    getSupplierOrders,
    getActiveSupplierOrders,
    getSupplierFinancialSummary
};