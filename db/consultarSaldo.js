import { pool } from "./init.js";
import { normalizarTelefono } from "../utils/phone.js";

// --- CONSULTAR SALDO PENDIENTE ---
export const consultarSaldo = async (input) => {
  try {
    let query = "";
    let values = [];

    const limpio = input.toString().trim();

    // 1️⃣ ID numérico (id del pedido)
    if (/^\d+$/.test(limpio) && limpio.length <= 6) {
      query = `
        SELECT id, order_code, descripcion_trabajo, valor_total, valor_abonado
        FROM orders
        WHERE id = $1
          AND cancelado = false
      `;
      values = [Number(limpio)];
    }

    // 2️⃣ Código de pedido MN-AAAA-XXXX
    else if (/^MN-\d{4}-\d{4}$/i.test(limpio)) {
      query = `
        SELECT id, order_code, descripcion_trabajo, valor_total, valor_abonado
        FROM orders
        WHERE order_code = $1
          AND cancelado = false
      `;
      values = [limpio.toUpperCase()];
    }

    // 3️⃣ Número de WhatsApp
    else if (/^\d{7,10}$/.test(limpio)) {
      const telefono = normalizarTelefono(limpio);

      query = `
        SELECT id, order_code, descripcion_trabajo, valor_total, valor_abonado
        FROM orders
        WHERE numero_whatsapp = $1
          AND cancelado = false
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
        message: "No encontramos pedidos asociados a este número.",
      };
    }

    // ✅ Respuesta limpia
    return rows.map((order) => {
      const total = Number(order.valor_total);
      const anticipo = Number(order.valor_abonado || 0);

      return {
        id: order.id,
        codigo: order.order_code,
        descripcion: order.descripcion_trabajo,
        total,
        anticipo,
        saldo: total - anticipo,
      };
    });
  } catch (error) {
    console.error("❌ Error consultando saldo:", error);
    return {
      error: true,
      message: "Hubo un error consultando el saldo. Intenta más tarde.",
    };
  }
};

