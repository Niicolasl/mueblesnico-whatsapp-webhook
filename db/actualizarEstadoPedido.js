import { pool } from "./init.js";

export async function actualizarEstadoPedido(orderCode, nuevoEstado) {
    const { rows, rowCount } = await pool.query(
        `
    UPDATE orders
    SET estado_pedido = $1,
        fue_entregado = CASE 
          WHEN $1 = 'ENTREGADO' THEN true 
          ELSE fue_entregado 
        END
    WHERE order_code = $2
      AND cancelado = false
    RETURNING *
    `,
        [nuevoEstado, orderCode]
    );

    if (rowCount === 0) return null;

    return rows[0];
}
