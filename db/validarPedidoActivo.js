import { pool } from "./init.js";

export async function obtenerPedidoActivo(orderCode) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE order_code = $1`,
    [orderCode]
  );

  if (!rows.length) {
    return { error: "NO_EXISTE" };
  }

  const pedido = rows[0];

  // ❌ Cancelado
  if (pedido.cancelado) {
    return { error: "CANCELADO", pedido };
  }

  const saldoPendiente = Number(pedido.saldo_pendiente || 0);
  const fueEntregado = Boolean(pedido.fue_entregado);

  // ❌ FINALIZADO REAL
  if (saldoPendiente === 0 && fueEntregado) {
    return { error: "FINALIZADO", pedido };
  }

  // ✅ ACTIVO
  return {
    pedido: {
      ...pedido,
      saldo: saldoPendiente,
    },
  };
}
