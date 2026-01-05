import { pool } from "./init.js";

export async function obtenerPedidoActivo(orderCode) {
  const result = await pool.query(
    `
    SELECT *
    FROM orders
    WHERE order_code = $1
    `,
    [orderCode]
  );

  if (result.rows.length === 0) {
    return { error: "NO_EXISTE" };
  }

  const pedido = result.rows[0];

  // ❌ Cancelado
  if (pedido.cancelado || pedido.estado_pedido === "CANCELADO") {
    return { error: "CANCELADO", pedido };
  }

  const saldoPendiente = Number(pedido.saldo_pendiente || 0);
  const estado = (pedido.estado_pedido || "").toUpperCase();

  // ❌ Finalizado REAL: entregado + sin saldo
  if (estado === "ENTREGADO" && saldoPendiente === 0) {
    return { error: "FINALIZADO", pedido };
  }

  // ✅ Pedido activo
  return {
    pedido: {
      ...pedido,
      saldo: saldoPendiente,
    },
  };
}
