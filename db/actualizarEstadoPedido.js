import { pool } from "./init.js";

export async function actualizarEstadoPedido(orderCode, nuevoEstado) {
  const result = await pool.query(
    `
    UPDATE orders 
    SET estado_pedido = $1 
    WHERE order_code = $2 AND cancelado = false 
    RETURNING *`,
    [nuevoEstado, orderCode]
  );
}
