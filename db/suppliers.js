import { pool } from './init.js';

/**
 * Crear o obtener un proveedor
 */
export async function getOrCreateSupplier(phone, name) {
    try {
        // Normalizar teléfono (10 dígitos sin código de país)
        const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

        // Verificar si ya existe
        const existingSupplier = await pool.query(
            'SELECT * FROM suppliers WHERE phone = $1',
            [normalizedPhone]
        );

        if (existingSupplier.rows.length > 0) {
            return existingSupplier.rows[0];
        }

        // Crear nuevo proveedor
        const result = await pool.query(
            `INSERT INTO suppliers (phone, name) 
       VALUES ($1, $2) 
       RETURNING *`,
            [normalizedPhone, name]
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error en getOrCreateSupplier:', error);
        throw error;
    }
}

/**
 * Buscar proveedor por teléfono
 */
export async function findSupplierByPhone(phone) {
    try {
        const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

        const result = await pool.query(
            'SELECT * FROM suppliers WHERE phone = $1',
            [normalizedPhone]
        );

        return result.rows[0] || null;
    } catch (error) {
        console.error('Error en findSupplierByPhone:', error);
        throw error;
    }
}

/**
 * Buscar proveedor por ID
 */
export async function findSupplierById(supplierId) {
    try {
        const result = await pool.query(
            'SELECT * FROM suppliers WHERE id = $1',
            [supplierId]
        );

        return result.rows[0] || null;
    } catch (error) {
        console.error('Error en findSupplierById:', error);
        throw error;
    }
}

/**
 * Obtener todos los proveedores
 */
export async function getAllSuppliers() {
    try {
        const result = await pool.query(
            'SELECT * FROM suppliers ORDER BY name ASC'
        );

        return result.rows;
    } catch (error) {
        console.error('Error en getAllSuppliers:', error);
        throw error;
    }
}