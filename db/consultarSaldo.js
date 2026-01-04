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
        SELECT *
        FROM orders
        WHERE id = $1
      `;
      values = [Number(limpio)];
    }

    // 2️⃣ Código de pedido MN-AAAA-XXXX
    else if (/^MN-\d{4}-\d{4}$/i.test(limpio)) {
      query = `
        SELECT *
        FROM orders
        WHERE order_code = $1
      `;
      values = [limpio.toUpperCase()];
    }

    // 3️⃣ Número de WhatsApp
    else if (/^\d{7,10}$/.test(limpio)) {
      const telefono = normalizarTelefono(limpio);

      query = `
        SELECT *
        FROM orders
        WHERE numero_whatsapp = $1
        ORDER BY id DESC
      `;
      values = [telefono];
    }

    // ❌ Formato inválido
    else {
      return {
        error: true,
        message:
          "Formato no válido. Usa el ID, el código del pedido (MN-AAAA-XXXX) o tu número de WhatsApp.",
      };
    }

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return {
        error: true,
        message: "No encontramos pedidos asociados a este dato.",
      };
    }

    const pedidosValidos = [];

    for (const order of rows) {
      const validacion = await obtenerPedidoActivo(order.order_code);

      // ❌ Cancelado
      if (validacion.error === "CANCELADO") continue;

      // ❌ Entregado y pagado completamente
      const total = Number(order.valor_total);
      const anticipo = Number(order.valor_abonado || 0);
      const saldo = total - anticipo;

      if (order.estado_pedido === "ENTREGADO" && saldo === 0 || order.estado_pedido === "pagado" && saldo === 0) {
        continue;
      }

      pedidosValidos.push({
        id: order.id,
        codigo: order.order_code,
        descripcion: order.descripcion_trabajo,
        total,
        anticipo,
        saldo,
      });
    }

    if (pedidosValidos.length === 0) {
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
