import { pool } from "./init.js";

// --- CONSULTAR SALDO PENDIENTE ---
export const consultarSaldo = async (input) => {
    try {
        let query = "";
        let values = [];

        // 1️⃣ Si viene como ID numérico
        if (/^\d+$/.test(input)) {
            query = "SELECT * FROM orders WHERE id = $1 AND cancelado = false";
            values = [Number(input)];
        }

        // 2️⃣ Si viene con código MN-123
        else if (/^MN-\d+$/i.test(input)) {
            query = "SELECT * FROM orders WHERE codigo = $1 AND cancelado = false";
            values = [input.toUpperCase()];
        }

        // 3️⃣ Si viene como número de WhatsApp 57320...
        else if (/^\d{11,15}$/.test(input)) {
            const number = "+" + input;
            query = "SELECT * FROM orders WHERE numero_whatsapp = $1 AND cancelado = false";
            values = [number];
        }

        // ❌ Si no coincide con ninguna forma válida
        else {
            return {
                error: true,
                message: "El formato ingresado no es válido. Usa un número de pedido, ID o tu número de WhatsApp."
            };
        }

        const { rows } = await pool.query(query, values);

        if (rows.length === 0) {
            return {
                error: true,
                message: "No encontré pedidos activos con ese dato."
            };
        }

        // Si existe uno o varios → devolver lista con saldo
        const response = rows.map(order => ({
            id: order.id,
            codigo: order.codigo,
            descripcion: order.descripcion,
            total: order.total,
            anticipo: order.anticipo,
            saldo: Number(order.total) - Number(order.anticipo)
        }));

        return response;

    } catch (error) {
        console.error("❌ Error consultando saldo:", error);
        return {
            error: true,
            message: "Hubo un error consultando el saldo. Intenta más tarde."
        };
    }
};
