import { getOrCreateSupplier, findSupplierByPhone } from '../db/suppliers.js';
import { createSupplierOrder } from '../db/supplierOrders.js';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '../services/whatsappSender.js';

// Almacenar estado del flujo por usuario
const flowStates = new Map();

const FLOW_STEPS = {
    WAITING_PHONE: 'waiting_phone',
    WAITING_NAME: 'waiting_name',
    WAITING_DESCRIPTION: 'waiting_description',
    WAITING_AMOUNT: 'waiting_amount',
    WAITING_CONFIRMATION: 'waiting_confirmation'
};

/**
 * Iniciar flujo de creación de orden a proveedor
 */
export function startSupplierOrderFlow(adminPhone) {
    flowStates.set(adminPhone, {
        step: FLOW_STEPS.WAITING_PHONE,
        data: {}
    });

    return '👷 *NUEVA ORDEN A PROVEEDOR*\n\n📱 ¿Cuál es el *número de WhatsApp* del proveedor?\n\nsin +57';
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
            case FLOW_STEPS.WAITING_PHONE:
                return await handlePhoneStep(adminPhone, message, state);

            case FLOW_STEPS.WAITING_NAME:
                return await handleNameStep(adminPhone, message, state);

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
 * Paso 1: Teléfono del proveedor (PRIMERO)
 */
async function handlePhoneStep(adminPhone, message, state) {
    const phone = message.replace(/\D/g, '');

    if (phone.length !== 10) {
        return '❌ El número debe tener exactamente 10 dígitos.\n\nIntenta nuevamente:';
    }

    state.data.phone = phone;

    // 🔍 Buscar si el proveedor ya existe
    const existingSupplier = await findSupplierByPhone(phone);

    if (existingSupplier) {
        // ✅ Proveedor existe → Saltar paso de nombre
        state.data.nombre = existingSupplier.name;
        state.data.supplierId = existingSupplier.id;
        state.step = FLOW_STEPS.WAITING_DESCRIPTION;
        flowStates.set(adminPhone, state);

        return `✅ Proveedor encontrado: *${existingSupplier.name}*\n\n🛠️ Describe el *trabajo* que realizará: `;
    } else {
        // ❌ Proveedor NO existe → Pedir nombre
        state.step = FLOW_STEPS.WAITING_NAME;
        flowStates.set(adminPhone, state);

        return '👤 Este es un *nuevo proveedor*.\n\n¿Cuál es su *nombre*?';
    }
}

/**
 * Paso 2: Nombre del proveedor (SOLO si es nuevo)
 */
async function handleNameStep(adminPhone, message, state) {
    const nombre = message.trim();

    if (!nombre || nombre.length < 2) {
        return '❌ El nombre debe tener al menos 2 caracteres. Intenta nuevamente:';
    }

    state.data.nombre = nombre;
    state.step = FLOW_STEPS.WAITING_DESCRIPTION;
    flowStates.set(adminPhone, state);

    return '🛠️ Describe el *trabajo* que realizará el proveedor:';
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

    return '💰 ¿Cuál es el *valor total* acordado?';
}

/**
 * Paso 4: Valor total
 */
async function handleAmountStep(adminPhone, message, state) {
    const base = parseFloat(message.replace(/\D/g, ''));
    const valor = base * 1000; // 🔥 Multiplica por 1000 automáticamente

    if (isNaN(valor) || valor <= 0) {
        return '❌ Debe ser un valor numérico mayor a cero.\n\nIntenta nuevamente:';
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
    let supplier;

    if (state.data.supplierId) {
        // Proveedor ya existe
        supplier = { id: state.data.supplierId };
    } else {
        // Crear nuevo proveedor
        supplier = await getOrCreateSupplier(state.data.phone, state.data.nombre);
    }

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