import { pool } from "./init.js";
import { normalizarTelefono } from "../utils/phone.js";
import { obtenerPedidoActivo } from "./validarPedidoActivo.js";

// --- CONSULTAR SALDO ---
export const consultarSaldo = async (input) => {
  try {
    let query = "";
    let values = [];

    const limpio = input.toString().trim();

    // 1️⃣ ID numérico
    if (/^\d+$/.test(limpio) && limpio.length <= 6) {
      query = `
        SELECT *,
               (valor_total - COALESCE(valor_abonado, 0)) AS saldo
        FROM orders
        WHERE id = $1
      `;
      values = [Number(limpio)];
    }

    // 2️⃣ Código de pedido
    else if (/^MN-\d{4}-\d{4}$/i.test(limpio)) {
      query = `
        SELECT *,
               (valor_total - COALESCE(valor_abonado, 0)) AS saldo
        FROM orders
        WHERE order_code = $1
      `;
      values = [limpio.toUpperCase()];
    }

    // 3️⃣ Número WhatsApp
    else if (/^\d{7,10}$/.test(limpio)) {
      const telefono = normalizarTelefono(limpio);

      query = `
        SELECT *,
               (valor_total - COALESCE(valor_abonado, 0)) AS saldo
        FROM orders
        WHERE numero_whatsapp = $1
        ORDER BY id DESC
      `;
      values = [telefono];
    }

    else {
      return {
        error: true,
        message:
          "Formato no válido. Usa el ID, el código del pedido (MN-AAAA-XXXX) o tu número de WhatsApp.",
      };
    }

    const { rows } = await pool.query(query, values);

    if (!rows.length) {
      return {
        error: true,
        message: "No encontramos pedidos asociados a este dato.",
      };
    }

    const pedidosValidos = [];

    for (const order of rows) {
      const saldo = Number(order.saldo);
      const fueEntregado = Boolean(order.fue_entregado);

      // ❌ SOLO excluir si está ENTREGADO y PAGADO
      if (fueEntregado && saldo === 0) continue;

      // ❌ Cancelado
      if (order.cancelado) continue;

      pedidosValidos.push({
        id: order.id,
        codigo: order.order_code,
        descripcion: order.descripcion_trabajo,
        total: Number(order.valor_total),
        anticipo: Number(order.valor_abonado || 0),
        saldo,
        fue_entregado: fueEntregado,
      });
    }

    if (!pedidosValidos.length) {
      return {
        error: true,
        message: "No encontramos pedidos activos con saldo consultable.",
      };
    }

    return pedidosValidos;
  } catch (error) {
    console.error("❌ Error consultando saldo:", error);
    return {
      error: true,
      message: "Hubo un error consultando el saldo. Intenta más tarde.",
    };
  }
};

