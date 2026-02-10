/**
 * Plantillas aprobadas en Meta para WhatsApp Business
 * Versión ES Modules
 */

const TEMPLATES = {
    // Plantilla para clientes: pedido creado
    pedido_creado: {
        name: 'pedido_creado',
        language: 'es',
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

    // Plantilla para proveedores: orden creada
    orden_proveedor_creada: {
        name: 'orden_proveedor_creada',
        language: 'es',
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
        language: 'es',
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
        language: 'es',
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
        language: 'es',
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

/**
 * Función helper para crear plantilla de pedido creado (mantiene compatibilidad)
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

export { TEMPLATES };