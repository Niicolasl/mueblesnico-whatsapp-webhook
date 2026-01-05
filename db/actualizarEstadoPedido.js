import { pool } from "./init.js";

export async function actualizarEstadoPedido(orderCode, nuevoEstado) {
    const fueEntregado = nuevoEstado === "ENTREGADO";

    const { rows, rowCount } = await pool.query(
        `
    UPDATE orders
    SET
      estado_pedido = $1,
      fue_entregado = CASE
        WHEN $3 = true THEN true
        ELSE fue_entregado
      END
    WHERE order_code = $2
      AND cancelado = false
    RETURNING *
    `,
        [nuevoEstado, orderCode, fueEntregado]
    );

    if (rowCount === 0) return null;

    return rows[0];
}