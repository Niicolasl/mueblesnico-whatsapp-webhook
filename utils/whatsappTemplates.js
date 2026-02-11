/**
 * Plantillas aprobadas en Meta para WhatsApp Business
 * Versión ES Modules
 */

const TEMPLATES = {
    // ============================================
    // PLANTILLAS PARA CLIENTES
    // ============================================

    // Plantilla para clientes: pedido creado
    pedido_creado: {
        name: 'pedido_creado',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre cliente
                    { type: 'text', text: '' }, // 2. Código pedido
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }  // 4. Valor total
                ]
            }
        ]
    },

    // Plantilla para clientes: abono registrado (con saldo pendiente)
    abono_registrado: {
        name: 'abono_registrado',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre cliente
                    { type: 'text', text: '' }, // 2. Código pedido
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }, // 4. Valor abonado
                    { type: 'text', text: '' }  // 5. Saldo pendiente
                ]
            }
        ]
    },

    // Plantilla para clientes: pago total completado
    abono_total_pagado: {
        name: 'abono_total_pagado',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre cliente
                    { type: 'text', text: '' }, // 2. Código pedido
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }  // 4. Pago recibido
                ]
            }
        ]
    },

    // Plantilla para clientes: pedido listo
    pedido_listo: {
        name: 'pedido_listo',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre cliente
                    { type: 'text', text: '' }, // 2. Saludo según hora
                    { type: 'text', text: '' }, // 3. Código pedido
                    { type: 'text', text: '' }  // 4. Descripción trabajo
                ]
            }
        ]
    },

    // Plantilla para clientes: pedido entregado
    pedido_entregado: {
        name: 'pedido_entregado',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre cliente
                    { type: 'text', text: '' }, // 2. Código pedido
                    { type: 'text', text: '' }  // 3. Descripción trabajo
                ]
            }
        ]
    },

    // Plantilla para clientes: pedido cancelado
    pedido_cancelado: {
        name: 'pedido_cancelado',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre cliente
                    { type: 'text', text: '' }, // 2. Saludo según hora
                    { type: 'text', text: '' }, // 3. Código pedido
                    { type: 'text', text: '' }  // 4. Descripción trabajo
                ]
            }
        ]
    },

    // ============================================
    // PLANTILLAS PARA PROVEEDORES
    // ============================================

    // Plantilla para proveedores: orden creada
    orden_proveedor_creada: {
        name: 'orden_proveedor_creada',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre proveedor
                    { type: 'text', text: '' }, // 2. Código orden
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }  // 4. Valor acordado
                ]
            }
        ]
    },

    // Plantilla para proveedores: abono registrado
    abono_proveedor_registrado: {
        name: 'abono_proveedor_registrado',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre proveedor
                    { type: 'text', text: '' }, // 2. Código orden
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }, // 4. Abono registrado
                    { type: 'text', text: '' }, // 5. Total abonado
                    { type: 'text', text: '' }  // 6. Saldo pendiente
                ]
            }
        ]
    },

    // Plantilla para proveedores: orden completada
    orden_proveedor_completada: {
        name: 'orden_proveedor_completada',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre proveedor
                    { type: 'text', text: '' }, // 2. Código orden
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }, // 4. Pago total
                    { type: 'text', text: '' }  // 5. Fecha completado
                ]
            }
        ]
    },

    // Plantilla para proveedores: orden cancelada
    orden_proveedor_cancelada: {
        name: 'orden_proveedor_cancelada',
        language: { code: 'es' },
        components: [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: '' }, // 1. Nombre proveedor
                    { type: 'text', text: '' }, // 2. Código orden
                    { type: 'text', text: '' }, // 3. Descripción trabajo
                    { type: 'text', text: '' }  // 4. Total abonado
                ]
            }
        ]
    }
};

/**
 * Construir objeto de plantilla con parámetros
 */
export function buildTemplate(templateName, parameters) {
    const template = TEMPLATES[templateName];

    if (!template) {
        throw new Error(`Plantilla ${templateName} no encontrada`);
    }

    // Clonar plantilla
    const builtTemplate = JSON.parse(JSON.stringify(template));

    // Insertar parámetros
    if (parameters && parameters.length > 0) {
        builtTemplate.components[0].parameters = parameters.map(param => ({
            type: 'text',
            text: String(param)
        }));
    }

    return builtTemplate;
}

// ============================================
// FUNCIONES HELPER PARA CLIENTES
// ============================================

/**
 * Crear plantilla de pedido creado
 */
export function crearPlantillaPedidoCreado(order) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: buildTemplate('pedido_creado', [
            order.nombre_cliente,
            order.order_code,
            order.descripcion_trabajo,
            Number(order.valor_total).toLocaleString()
        ])
    };
}

/**
 * Crear plantilla de abono registrado (cuando hay saldo pendiente)
 */
export function crearPlantillaAbonoRegistrado(order, valorAbonado) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: buildTemplate('abono_registrado', [
            order.nombre_cliente,
            order.order_code,
            order.descripcion_trabajo,
            Number(valorAbonado).toLocaleString(),
            Number(order.saldo_pendiente).toLocaleString()
        ])
    };
}

/**
 * Crear plantilla de pago total completado
 */
export function crearPlantillaAbonoTotalPagado(order, valorAbonado) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: buildTemplate('abono_total_pagado', [
            order.nombre_cliente,
            order.order_code,
            order.descripcion_trabajo,
            Number(valorAbonado).toLocaleString()
        ])
    };
}

/**
 * Crear plantilla de pedido listo
 */
export function crearPlantillaPedidoListo(order, saludoHora) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: buildTemplate('pedido_listo', [
            order.nombre_cliente,
            saludoHora,
            order.order_code,
            order.descripcion_trabajo
        ])
    };
}

/**
 * Crear plantilla de pedido entregado
 */
export function crearPlantillaPedidoEntregado(order) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: buildTemplate('pedido_entregado', [
            order.nombre_cliente,
            order.order_code,
            order.descripcion_trabajo
        ])
    };
}

/**
 * Crear plantilla de pedido cancelado
 */
export function crearPlantillaPedidoCancelado(order, saludoHora) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: buildTemplate('pedido_cancelado', [
            order.nombre_cliente,
            saludoHora,
            order.order_code,
            order.descripcion_trabajo
        ])
    };
}

export { TEMPLATES };