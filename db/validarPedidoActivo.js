import { pool } from "./init.js";

export async function obtenerPedidoActivo(orderCode) {
    const result = await pool.query(
        `SELECT * FROM orders WHERE order_code = $1`,
        [orderCode]
    );

    if (result.rows.length === 0) {
        return { error: "NO_EXISTE" };
    }

    const pedido = result.rows[0];

    if (pedido.cancelado || pedido.estado_pedido === "CANCELADO") {
        return { error: "CANCELADO", pedido };
    }

    return { pedido };
}
