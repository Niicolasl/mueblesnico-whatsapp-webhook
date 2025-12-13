import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function registrarAnticipo(orderCode, valorAbonado) {
    try {
        // Buscar pedido
        const result = await pool.query(
            "SELECT * FROM orders WHERE order_code = $1 AND cancelado = false",
            [orderCode]
        );

        if (result.rows.length === 0) return null;

        const order = result.rows[0];

        const nuevoAbono = Number(order.valor_abonado) + Number(valorAbonado);
        const nuevoSaldo = Number(order.valor_total) - nuevoAbono;

        // Calcular fecha de entrega (15 días después de HOY)
        const fechaEntrega = new Date();
        fechaEntrega.setDate(fechaEntrega.getDate() + 15);

        const fechaEntregaISO = fechaEntrega.toISOString().split("T")[0];

        const update = await pool.query(
            `UPDATE orders
       SET valor_abonado = $1,
           saldo_pendiente = $2,
           fecha_aprox_entrega = $3,
           estado_pedido = 'pendiente de inicio'
       WHERE order_code = $4
       RETURNING *`,
            [nuevoAbono, nuevoSaldo, fechaEntregaISO, orderCode]
        );

        return update.rows[0];

    } catch (err) {
        console.error("Error en registrarAnticipo:", err);
        return null;
    }
}
