import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Cancela un pedido por código (MN-2025-0001)
export async function cancelarPedido(orderCode) {
    try {
        const { rowCount, rows } = await pool.query(
            `
      UPDATE orders
      SET 
        cancelado = true,
        estado_pedido = 'CANCELADO',
        fecha_cancelacion = CURRENT_DATE
      WHERE order_code = $1
        AND cancelado = false
      RETURNING *;
      `,
            [orderCode]
        );

        if (rowCount === 0) {
            return null; // no existe o ya estaba cancelado
        }

        return rows[0];
    } catch (error) {
        console.error("❌ Error cancelando pedido:", error);
        return "error";
    }
}
