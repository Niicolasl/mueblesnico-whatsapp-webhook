import { pool } from "./init.js";
import { normalizarTelefono } from "../utils/phone.js";
import { obtenerPedidoActivo } from "./validarPedidoActivo.js";

/************************************************
 * GENERAR CÓDIGO DE PEDIDO (MN-AAAA-XXXX)
 ************************************************/
export async function generateOrderCode() {
    const year = new Date().getFullYear();

    const { rows } = await pool.query(
        "SELECT last_number FROM order_sequence WHERE year = $1",
        [year]
    );

    let next = 1;

    if (rows.length === 0) {
        await pool.query(
            "INSERT INTO order_sequence (year, last_number) VALUES ($1,$2)",
            [year, 1]
        );
    } else {
        next = rows[0].last_number + 1;
        await pool.query(
            "UPDATE order_sequence SET last_number = $1 WHERE year = $2",
            [next, year]
        );
    }

    return `MN-${year}-${String(next).padStart(4, "0")}`;
}

/************************************************
 * CREAR PEDIDO
 ************************************************/
export async function createOrder({
    nombre_cliente,
    numero_whatsapp,
    descripcion_trabajo,
    valor_total,
}) {
    const order_code = await generateOrderCode();
    const telefono = normalizarTelefono(numero_whatsapp);

    const { rows } = await pool.query(
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
    VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,0,$5,'pendiente de anticipo',false)
    RETURNING *;
    `,
        [
            order_code,
            nombre_cliente,
            telefono,
            descripcion_trabajo,
            valor_total,
        ]
    );

    return rows[0];
}

/************************************************
 * REGISTRAR ANTICIPO (ÚNICA FUNCIÓN)
 ************************************************/
export async function registrarAnticipo(order_code, valor) {
    const { rows } = await pool.query(
        `
    SELECT * FROM orders
    WHERE order_code = $1 AND cancelado = false
    `,
        [order_code]
    );

    if (rows.length === 0) return null;

    const order = rows[0];
    const abono = Number(valor);

    if (abono <= 0) return "valor_invalido";

    const nuevoAbonado = Number(order.valor_abonado) + abono;
    const nuevoSaldo = Number(order.valor_total) - nuevoAbonado;

    if (nuevoSaldo < 0) return "excede_total";

    const fechaEntrega = order.fecha_aprox_entrega
        ? order.fecha_aprox_entrega
        : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    const update = await pool.query(
        `
    UPDATE orders
    SET
      valor_abonado = $1,
      saldo_pendiente = $2,
      fecha_aprox_entrega = $3,
      estado_pedido = 'pendiente de inicio'
    WHERE order_code = $4
    RETURNING *;
    `,
        [
            nuevoAbonado,
            nuevoSaldo,
            fechaEntrega,
            order_code,
        ]
    );

    return update.rows[0];
}

/************************************************
 * CANCELAR PEDIDO (ÚNICA FUNCIÓN)
 ************************************************/
export async function cancelarPedido(order_code) {
    const { rowCount, rows } = await pool.query(
        `
    UPDATE orders
    SET
      cancelado = true,
      estado_pedido = 'cancelado',
      fecha_cancelacion = CURRENT_DATE
    WHERE order_code = $1 AND cancelado = false
    RETURNING *;
    `,
        [order_code]
    );

    if (rowCount === 0) return null;
    return rows[0];
}

/************************************************
 * CONSULTAS
 ************************************************/
export async function getOrder(order_code) {
  const { rows } = await pool.query(
    "SELECT * FROM orders WHERE order_code = $1",
    [order_code]
  );

  return rows[0] || null;
}

/************************************************
 * PEDIDOS ACTIVOS POR TELÉFONO
 ************************************************/
export async function getPedidosByPhone(telefono) {
    const clean = normalizarTelefono(telefono);

    const { rows } = await pool.query(
        `
    SELECT *,
           (valor_total - COALESCE(valor_abonado, 0)) AS saldo
    FROM orders
    WHERE numero_whatsapp = $1
      AND cancelado = false
      AND NOT (
        fue_entregado = true
        AND (valor_total - COALESCE(valor_abonado, 0)) = 0
      )
    ORDER BY id DESC
    `,
        [clean]
    );

    return rows || [];
}

export async function getAllActivePedidos(limit = 10) {
    const { rows } = await pool.query(
        `
    SELECT 
      id,
      order_code,
      nombre_cliente,
      numero_whatsapp,
      descripcion_trabajo,
      valor_total,
      valor_abonado,
      saldo_pendiente,
      estado_pedido,
      fecha_creacion,
      fecha_aprox_entrega,
      fue_entregado
    FROM orders
    WHERE cancelado = false
      AND NOT (
        fue_entregado = true 
        AND saldo_pendiente = 0
      )
    ORDER BY fecha_creacion DESC
    LIMIT $1
    `,
        [limit]
    );

    return rows || [];
}

/**
 * Obtener pedidos activos de un cliente específico por teléfono
 */
export async function getPedidosActivosByPhone(telefono) {
    const clean = normalizarTelefono(telefono);

    const { rows } = await pool.query(
        `
    SELECT 
      id,
      order_code,
      nombre_cliente,
      numero_whatsapp,
      descripcion_trabajo,
      valor_total,
      valor_abonado,
      saldo_pendiente,
      estado_pedido,
      fecha_creacion,
      fecha_aprox_entrega,
      fue_entregado
    FROM orders
    WHERE numero_whatsapp = $1
      AND cancelado = false
      AND NOT (
        fue_entregado = true 
        AND saldo_pendiente = 0
      )
    ORDER BY fecha_creacion DESC
    `,
        [clean]
    );

    return rows || [];
}
