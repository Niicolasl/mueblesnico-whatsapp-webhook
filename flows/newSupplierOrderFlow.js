import { getOrCreateSupplier } from '../db/suppliers.js';
import { createSupplierOrder } from '../db/supplierOrders.js';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '../services/whatsappSender.js';

// Almacenar estado del flujo por usuario
const flowStates = new Map();

const FLOW_STEPS = {
    WAITING_NAME: 'waiting_name',
    WAITING_PHONE: 'waiting_phone',
    WAITING_DESCRIPTION: 'waiting_description',
    WAITING_AMOUNT: 'waiting_amount',
    WAITING_CONFIRMATION: 'waiting_confirmation'
};

/**
 * Iniciar flujo de creación de orden a proveedor
 */
export function startSupplierOrderFlow(adminPhone) {
    flowStates.set(adminPhone, {
        step: FLOW_STEPS.WAITING_NAME,
        data: {}
    });

    return '👷 *NUEVA ORDEN A PROVEEDOR*\n\n¿Cuál es el *nombre del proveedor*?';
}

/**
 * Procesar mensaje del flujo
 */
export async function processSupplierOrderFlow(adminPhone, message) {
    const state = flowStates.get(adminPhone);

    if (!state) {
        return null;
    }

    try {
        switch (state.step) {
            case FLOW_STEPS.WAITING_NAME:
                return await handleNameStep(adminPhone, message, state);

            case FLOW_STEPS.WAITING_PHONE:
                return await handlePhoneStep(adminPhone, message, state);

            case FLOW_STEPS.WAITING_DESCRIPTION:
                return await handleDescriptionStep(adminPhone, message, state);

            case FLOW_STEPS.WAITING_AMOUNT:
                return await handleAmountStep(adminPhone, message, state);

            case FLOW_STEPS.WAITING_CONFIRMATION:
                return await handleConfirmationStep(adminPhone, message, state);

            default:
                flowStates.delete(adminPhone);
                return '❌ Error en el flujo. Intenta nuevamente con /pnuevo';
        }
    } catch (error) {
        console.error('Error en flujo de orden a proveedor:', error);
        flowStates.delete(adminPhone);
        return `❌ Error: ${error.message}`;
    }
}

/**
 * Paso 1: Nombre del proveedor
 */
async function handleNameStep(adminPhone, message, state) {
    const nombre = message.trim();

    if (!nombre || nombre.length < 2) {
        return '❌ El nombre debe tener al menos 2 caracteres. Intenta nuevamente:';
    }

    state.data.nombre = nombre;
    state.step = FLOW_STEPS.WAITING_PHONE;
    flowStates.set(adminPhone, state);

    return '📱 ¿Cuál es el *número de WhatsApp* del proveedor?\n\n_Formato: 10 dígitos (ej: 3204128555)_';
}

/**
 * Paso 2: Teléfono del proveedor
 */
async function handlePhoneStep(adminPhone, message, state) {
    const phone = message.replace(/\D/g, '');

    if (phone.length !== 10) {
        return '❌ El número debe tener exactamente 10 dígitos.\n\n_Ejemplo: 3204128555_\n\nIntenta nuevamente:';
    }

    state.data.phone = phone;
    state.step = FLOW_STEPS.WAITING_DESCRIPTION;
    flowStates.set(adminPhone, state);

    return '🛠️ Describe el *trabajo* que realizará el proveedor:\n\n_Ejemplo: Pintar 3 sillas de madera color café_';
}

/**
 * Paso 3: Descripción del trabajo
 */
async function handleDescriptionStep(adminPhone, message, state) {
    const descripcion = message.trim();

    if (!descripcion || descripcion.length < 5) {
        return '❌ La descripción debe tener al menos 5 caracteres. Intenta nuevamente:';
    }

    state.data.descripcion = descripcion;
    state.step = FLOW_STEPS.WAITING_AMOUNT;
    flowStates.set(adminPhone, state);

    return '💰 ¿Cuál es el *valor total* acordado?\n\n_Solo números (ej: 150000)_';
}

/**
 * Paso 4: Valor total
 */
async function handleAmountStep(adminPhone, message, state) {
    const valor = parseFloat(message.replace(/\D/g, ''));

    if (isNaN(valor) || valor <= 0) {
        return '❌ Debe ser un valor numérico mayor a cero.\n\n_Ejemplo: 150000_\n\nIntenta nuevamente:';
    }

    state.data.valor = valor;
    state.step = FLOW_STEPS.WAITING_CONFIRMATION;
    flowStates.set(adminPhone, state);

    // Mostrar resumen
    const resumen = `📋 *RESUMEN DE NUEVA ORDEN A PROVEEDOR*

👷 *Proveedor:* ${state.data.nombre}
📱 *Teléfono:* ${state.data.phone}
🛠️ *Trabajo:* ${state.data.descripcion}
💰 *Valor total:* $${valor.toLocaleString()}

¿Confirmas crear esta orden?

Responde *SI* para confirmar o *NO* para cancelar`;

    return resumen;
}

/**
 * Paso 5: Confirmación
 */
async function handleConfirmationStep(adminPhone, message, state) {
    const respuesta = message.trim().toUpperCase();

    if (respuesta !== 'SI' && respuesta !== 'NO') {
        return '❌ Responde *SI* para confirmar o *NO* para cancelar';
    }

    if (respuesta === 'NO') {
        flowStates.delete(adminPhone);
        return '❌ Creación de orden cancelada';
    }

    // Crear proveedor (si no existe) y orden
    const supplier = await getOrCreateSupplier(state.data.phone, state.data.nombre);
    const orden = await createSupplierOrder(
        supplier.id,
        state.data.descripcion,
        state.data.valor
    );

    // Enviar plantilla al proveedor
    try {
        await sendWhatsAppTemplate(
            state.data.phone,
            'orden_proveedor_creada',
            [
                state.data.nombre,
                orden.order_code,
                state.data.descripcion,
                state.data.valor.toLocaleString()
            ]
        );
    } catch (error) {
        console.error('Error enviando plantilla al proveedor:', error);
    }

    flowStates.delete(adminPhone);

    return `✅ *ORDEN CREADA EXITOSAMENTE*

📦 Código: *${orden.order_code}*
👷 Proveedor: ${state.data.nombre}
💰 Valor: $${state.data.valor.toLocaleString()}

✉️ Se ha enviado notificación al proveedor`;
}

/**
 * Verificar si hay flujo activo
 */
export function hasActiveFlow(adminPhone) {
    return flowStates.has(adminPhone);
}

/**
 * Cancelar flujo activo
 */
export function cancelFlow(adminPhone) {
    flowStates.delete(adminPhone);
    return '❌ Flujo de creación de orden cancelado';
}