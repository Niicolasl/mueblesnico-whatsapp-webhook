import { pool } from "./init.js";

export async function registrarAnticipo(orderCode, valorAbonado) {
    try {
        // 🔎 Buscar pedido activo
        const result = await pool.query(
            "SELECT * FROM orders WHERE order_code = $1 AND cancelado = false",
            [orderCode]
        );

        if (result.rows.length === 0) return null;

        const order = result.rows[0];

        const saldoActual = Number(order.saldo_pendiente);
        const abonadoActual = Number(order.valor_abonado);
        const total = Number(order.valor_total);

        // ❌ No permitir abonos si ya está pagado
        if (saldoActual <= 0) {
            return { error: "PAGADO" };
        }

        // ❌ No permitir abono mayor al saldo
        if (valorAbonado > saldoActual) {
            return {
                error: "EXCEDE_SALDO",
                saldo: saldoActual
            };
        }

        const nuevoAbono = abonadoActual + valorAbonado;
        const nuevoSaldo = total - nuevoAbono;

        // 📅 Definir fecha de entrega SOLO si es el primer anticipo
        let fechaEntrega = order.fecha_aprox_entrega;

        if (abonadoActual === 0) {
            const fecha = new Date();
            fecha.setDate(fecha.getDate() + 18);
            fechaEntrega = fecha.toISOString().split("T")[0];
        }

        const update = await pool.query(
            `UPDATE orders
       SET
         valor_abonado = $1,
         saldo_pendiente = $2,
         fecha_aprox_entrega = $3,
         estado_pedido = $4
       WHERE order_code = $5
       RETURNING *`,
            [
                nuevoAbono,
                nuevoSaldo,
                fechaEntrega,
                nuevoSaldo === 0 ? "pagado" : "en_fabricacion",
                orderCode
            ]
        );

        return update.rows[0];

    } catch (err) {
        console.error("Error en registrarAnticipo:", err);
        return null;
    }
}
