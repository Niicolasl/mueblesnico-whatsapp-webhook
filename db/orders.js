import { pool } from "./init.js";
import { normalizarTelefono } from "../utils/phone.js";

/************************************************
 *  GENERAR CÓDIGO DE PEDIDO (MN-AAAA-XXXX)
 ************************************************/
export async function generateOrderCode() {
    const currentYear = new Date().getFullYear();

    const seqResult = await pool.query(
        "SELECT last_number FROM order_sequence WHERE year = $1",
        [currentYear]
    );

    let nextNumber = 1;

    if (seqResult.rows.length === 0) {
        await pool.query(
            "INSERT INTO order_sequence (year, last_number) VALUES ($1, $2)",
            [currentYear, 1]
        );
    } else {
        nextNumber = seqResult.rows[0].last_number + 1;
        await pool.query(
            "UPDATE order_sequence SET last_number = $1 WHERE year = $2",
            [nextNumber, currentYear]
        );
    }

    const numberFormatted = String(nextNumber).padStart(4, "0");
    return `MN-${currentYear}-${numberFormatted}`;
}

/************************************************
 *  CREAR PEDIDO
 ************************************************/
export async function createOrder({
    nombre_cliente,
    numero_whatsapp,
    descripcion_trabajo,
    valor_total
}) {
    const order_code = await generateOrderCode();
    const fecha_creacion = new Date();

    const telefono = normalizarTelefono(numero_whatsapp);

    const result = await pool.query(
        `
    INSERT INTO orders (
      order_code,
      nombre_cliente,
      numero_whatsapp,
      descripcion_trabajo,
      fecha_creacion,
      valor_total,
      valor_abonado,
      saldo_pendiente,
      estado_pedido,
      cancelado
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'nuevo',false)
    RETURNING *;
    `,
        [
            order_code,
            nombre_cliente,
            telefono,
            descripcion_trabajo,
            fecha_creacion,
            valor_total,
            0,
            valor_total
        ]
    );

    return result.rows[0];
}

/************************************************
 *  AGREGAR ANTICIPO
 ************************************************/
export async function addAnticipo(order_code, valor_abonado) {
    const result = await pool.query(
        `
    UPDATE orders
    SET
      valor_abonado = valor_abonado + $1,
      saldo_pendiente = saldo_pendiente - $1,
      fecha_aprox_entrega = COALESCE(
        fecha_aprox_entrega,
        CURRENT_DATE + INTERVAL '15 days'
      ),
      estado_pedido = 'pendiente'
    WHERE order_code = $2 AND cancelado = false
    RETURNING *;
    `,
        [valor_abonado, order_code]
    );

    return result.rows.length ? result.rows[0] : null;
}

/************************************************
 *  CANCELAR PEDIDO
 ************************************************/
export async function cancelOrder(order_code) {
    const result = await pool.query(
        `
    UPDATE orders
    SET
      cancelado = true,
      fecha_cancelacion = CURRENT_DATE,
      estado_pedido = 'cancelado'
    WHERE order_code = $1
    RETURNING *;
    `,
        [order_code]
    );

    return result.rows.length ? result.rows[0] : null;
}

/************************************************
 *  BUSCAR PEDIDO POR CÓDIGO
 ************************************************/
export async function getOrder(order_code) {
    const result = await pool.query(
        "SELECT * FROM orders WHERE order_code = $1",
        [order_code]
    );

    return result.rows.length ? result.rows[0] : null;
}

/************************************************
 *  BUSCAR PEDIDOS POR TELÉFONO
 ************************************************/
export async function getPedidosByPhone(telefono) {
    const clean = normalizarTelefono(telefono);

    const { rows } = await pool.query(
        `
    SELECT *
    FROM orders
    WHERE numero_whatsapp = $1
    ORDER BY id DESC
    `,
        [clean]
    );

    return rows;
}
