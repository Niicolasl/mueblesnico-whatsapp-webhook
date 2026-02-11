import axios from "axios";
import FormData from 'form-data';
import 'dotenv/config';
import { pool } from "../db/init.js";
import { normalizarTelefono } from "../utils/phone.js";

const CHATWOOT_BASE = process.env.CHATWOOT_BASE;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const INBOX_ID = Number(process.env.CHATWOOT_INBOX_ID);
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const headers = {
    api_access_token: CHATWOOT_TOKEN,
    "Content-Type": "application/json",
};

// ===============================
// 🏷️ MAPEO DE IDs DE ETIQUETAS
// ===============================
const LABEL_IDS = {
    pendiente_anticipo: 6,
    en_fabricacion: 1,
    listo: 3,
    entregado: 2,
    pago_pendiente: 5,
    pagado: 4
};

export const lastSentMessages = new Set();
const conversationCache = new Map();

// 🔒 Lock para prevenir sincronizaciones simultáneas
const syncLocks = new Map();

// ===============================
// 🛡️ SISTEMA DE SALUD DE CHATWOOT
// ===============================
let chatwootHealthy = true;
let lastHealthCheck = Date.now();
const HEALTH_CHECK_INTERVAL = 60000; // 1 minuto

/**
 * Detectar si respuesta es HTML de error (500)
 */
function isHTMLErrorResponse(data) {
    if (typeof data !== 'string') return false;
    return data.includes('<!DOCTYPE html>') ||
        data.includes('<title>We\'re sorry') ||
        data.includes('something went wrong');
}

/**
 * Marcar Chatwoot como caído
 */
function markChatwootDown() {
    if (chatwootHealthy) {
        console.error("🔴 Chatwoot marcado como INACTIVO - Respuestas de error detectadas");
        chatwootHealthy = false;
    }
}

/**
 * Marcar Chatwoot como activo
 */
function markChatwootUp() {
    const now = Date.now();
    if (!chatwootHealthy && (now - lastHealthCheck > HEALTH_CHECK_INTERVAL)) {
        console.log("🟢 Chatwoot marcado como ACTIVO");
        chatwootHealthy = true;
        lastHealthCheck = now;
    }
}

/**
 * Verificar si Chatwoot está saludable
 */
export function isChatwootHealthy() {
    return chatwootHealthy;
}

/**
 * Wrapper de Axios con detección de errores HTML
 */
async function safeChatwootRequest(requestFn) {
    if (!chatwootHealthy) {
        throw new Error("Chatwoot está marcado como inactivo");
    }

    try {
        const response = await requestFn();

        // 🔴 DETECTAR ERROR HTML EN RESPUESTA
        if (response.data && isHTMLErrorResponse(JSON.stringify(response.data))) {
            markChatwootDown();
            throw new Error("Chatwoot devolvió HTML de error (500)");
        }

        // 🟢 Si llegamos aquí, Chatwoot está funcionando
        markChatwootUp();
        return response;

    } catch (error) {
        // 🔴 DETECTAR ERROR HTML EN CATCH
        const errorData = error.response?.data;
        if (errorData && isHTMLErrorResponse(JSON.stringify(errorData))) {
            markChatwootDown();
            console.error("❌ Chatwoot caído (error HTML 500)");
            throw new Error("Chatwoot devolvió HTML de error (500)");
        }

        throw error;
    }
}

function toE164(phone) {
    let p = String(phone).replace(/\D/g, "");
    if (p.length === 10 && p.startsWith("3")) p = "57" + p;
    if (!p.startsWith("57") || p.length !== 12) throw new Error("Número inválido: " + phone);
    return "+" + p;
}

// ===============================
// 👤 CONTACTOS
// ===============================
async function getOrCreateContact(e164, name) {
    try {
        const search = await safeChatwootRequest(() =>
            axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
                params: { q: e164 },
                headers,
                timeout: 5000 // 🔥 AGREGADO TIMEOUT
            })
        );

        const results = search.data?.payload || [];
        const existing = results.find(c => c.phone_number === e164);
        if (existing) {
            console.log(`✅ Contacto existente ID: ${existing.id} (${e164})`);
            return existing.id;
        }

        console.log(`✨ Creando contacto nuevo: ${e164}`);
        const res = await safeChatwootRequest(() =>
            axios.post(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
                name: name || e164,
                phone_number: e164,
                identifier: e164
            }, { headers, timeout: 5000 })
        );

        const newId = res.data?.payload?.contact?.id;
        console.log(`✅ Contacto creado ID: ${newId}`);
        return newId;
    } catch (e) {
        if (e.response?.data?.message?.includes('already been taken')) {
            console.log("⚠️ Error duplicado, reintentando búsqueda...");
            const retry = await safeChatwootRequest(() =>
                axios.get(`${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search`, {
                    params: { q: e164 },
                    headers,
                    timeout: 5000
                })
            );
            const found = retry.data?.payload?.find(c => c.phone_number === e164);
            if (found) {
                console.log(`✅ Contacto encontrado en retry ID: ${found.id}`);
                return found.id;
            }
        }
        console.error("❌ Error getOrCreateContact:", e.message);
        throw e;
    }
}

// ===============================
// 💬 CONVERSACIONES (CON AUTO-ASIGNACIÓN)
// ===============================
async function getOrCreateConversation(e164, contactId) {
    if (conversationCache.has(e164)) {
        const cachedId = conversationCache.get(e164);
        console.log(`🔄 Usando conversación en caché: ${cachedId} para ${e164}`);
        return cachedId;
    }

    try {
        console.log(`🔍 Buscando conversaciones del contacto ${contactId}...`);
        const res = await safeChatwootRequest(() =>
            axios.get(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`,
                { headers, timeout: 5000 }
            )
        );

        const conversations = res.data?.payload || [];
        console.log(`📋 Encontradas ${conversations.length} conversaciones para contacto ${contactId}`);

        const existingConvo = conversations.find(c => {
            const isCorrectInbox = Number(c.inbox_id) === INBOX_ID;
            const isOpen = c.status !== 'resolved';

            if (isCorrectInbox && isOpen) {
                console.log(`   ✓ Conversación ${c.id}: inbox=${c.inbox_id}, status=${c.status}`);
            }

            return isCorrectInbox && isOpen;
        });

        if (existingConvo) {
            conversationCache.set(e164, existingConvo.id);
            console.log(`✅ Conversación encontrada y cacheada: ${existingConvo.id}`);

            // 🔥 AUTO-ASIGNAR SI NO TIENE AGENTE
            if (!existingConvo.assignee_id) {
                await asignarAgente(existingConvo.id, 1);
            }

            return existingConvo.id;
        }

        console.log(`✨ No hay conversación abierta. Creando nueva...`);
        const convo = await safeChatwootRequest(() =>
            axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
                {
                    source_id: e164,
                    inbox_id: INBOX_ID,
                    contact_id: contactId,
                    status: "open",
                    assignee_id: 1
                },
                { headers, timeout: 5000 }
            )
        );

        const convoId = convo.data?.id;
        conversationCache.set(e164, convoId);
        console.log(`✅ Conversación creada, cacheada y asignada al agente 1: ${convoId}`);
        return convoId;

    } catch (error) {
        console.error("❌ Error getOrCreateConversation:", error.message);
        return null;
    }
}

// 🔥 FUNCIÓN AUXILIAR PARA ASIGNAR AGENTE
async function asignarAgente(conversationId, agentId) {
    try {
        await safeChatwootRequest(() =>
            axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
                { assignee_id: agentId },
                { headers, timeout: 5000 }
            )
        );
        console.log(`👤 Agente ${agentId} asignado a conversación ${conversationId}`);
    } catch (err) {
        console.error(`⚠️ Error asignando agente:`, err.message);
    }
}

// ===============================
// 🗄️ CONSULTAS DE BASE DE DATOS
// ===============================

async function getPedidosActivosByPhone(phone) {
    const phoneNormalizado = normalizarTelefono(phone);

    const result = await pool.query(
        `SELECT * FROM orders 
         WHERE numero_whatsapp = $1 
         AND cancelado = false 
         AND fue_entregado = false 
         ORDER BY fecha_creacion DESC`,
        [phoneNormalizado]
    );
    return result.rows;
}

async function getPedidosConDeuda(phone) {
    const phoneNormalizado = normalizarTelefono(phone);

    const result = await pool.query(
        `SELECT order_code, descripcion_trabajo, saldo_pendiente, estado_pedido
         FROM orders 
         WHERE numero_whatsapp = $1 
         AND cancelado = false
         AND saldo_pendiente > 0
         ORDER BY fecha_creacion DESC`,
        [phoneNormalizado]
    );
    return result.rows;
}

async function getTotalGastadoHistorico(phone) {
    const result = await pool.query(
        `SELECT 
            COUNT(*) as total_pedidos,
            COALESCE(SUM(valor_total), 0) as total_gastado,
            MIN(fecha_creacion) as cliente_desde
         FROM orders 
         WHERE numero_whatsapp = $1`,
        [phone]
    );
    return result.rows[0];
}

// ===============================
// 🏷️ GESTIÓN DE ETIQUETAS (CORREGIDO)
// ===============================

export async function sincronizarEtiquetasCliente(phone) {
    // 🔒 MEJORA: Verificar si ya hay sincronización en progreso
    if (syncLocks.has(phone)) {
        const existingLock = syncLocks.get(phone);
        console.log(`⏳ Sincronización ya en progreso para ${phone}, esperando...`);
        await existingLock; // 🔥 ESPERAR a que termine la sincronización existente
        console.log(`✅ Sincronización anterior completada para ${phone}`);
        return;
    }

    // 🔒 Crear promesa de sincronización
    let resolveLock;
    const lockPromise = new Promise(resolve => { resolveLock = resolve; });
    syncLocks.set(phone, lockPromise);

    try {
        console.log(`🏷️ [${new Date().toISOString()}] Sincronizando etiquetas para ${phone}...`);

        const pedidosActivos = await getPedidosActivosByPhone(phone);
        const pedidosConDeuda = await getPedidosConDeuda(phone);

        const etiquetas = [];

        console.log(`🔍 DEBUG - Pedidos activos: ${pedidosActivos.length}, Con deuda: ${pedidosConDeuda.length}`);

        // ========================================
        // CASO 1: SIN PEDIDOS ACTIVOS Y SIN DEUDA
        // ========================================
        if (pedidosActivos.length === 0 && pedidosConDeuda.length === 0) {
            console.log(`✨ Cliente sin pedidos activos ni deudas → Sin etiquetas`);
            await reemplazarEtiquetas(phone, []);
            console.log(`✅ Etiquetas limpiadas (cliente con todo entregado y pagado)`);
            return;
        }

        // ========================================
        // CASO 2: SIN PEDIDOS ACTIVOS PERO CON DEUDA
        // ========================================
        if (pedidosActivos.length === 0 && pedidosConDeuda.length > 0) {
            etiquetas.push("entregado");
            etiquetas.push("pago_pendiente");
            await reemplazarEtiquetas(phone, etiquetas);
            console.log(`✅ Etiquetas sincronizadas: [${etiquetas.join(", ")}]`);
            return;
        }

        // ========================================
        // CASO 3: TIENE PEDIDOS ACTIVOS
        // ========================================
        if (pedidosActivos.length > 0) {
            const tienePendienteAnticipo = pedidosActivos.some(p =>
                p.estado_pedido === "pendiente de anticipo"
            );

            const tieneEnFabricacion = pedidosActivos.some(p =>
                p.estado_pedido === "EN_FABRICACION" ||
                p.estado_pedido === "pendiente de inicio"
            );

            const tieneListo = pedidosActivos.some(p =>
                p.estado_pedido === "LISTO"
            );

            // ETIQUETAS DE ESTADO DE PRODUCCIÓN
            if (tieneListo) {
                etiquetas.push("listo");
            } else if (tieneEnFabricacion) {
                etiquetas.push("en_fabricacion");
            } else if (tienePendienteAnticipo) {
                etiquetas.push("pendiente_anticipo");
            }

            // ETIQUETAS DE PAGO
            if (pedidosConDeuda.length > 0) {
                etiquetas.push("pago_pendiente");
            } else {
                etiquetas.push("pagado");
            }
        }

        await reemplazarEtiquetas(phone, etiquetas);
        console.log(`✅ Etiquetas sincronizadas: [${etiquetas.join(", ") || "NINGUNA"}]`);

    } catch (err) {
        console.error(`⚠️ Error sincronizando etiquetas:`, err.message);
    } finally {
        // 🔓 Liberar lock inmediatamente
        syncLocks.delete(phone);
        resolveLock();
    }
}

async function reemplazarEtiquetas(phone, labelNames) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        if (!conversationId) return;

        console.log(`🔍 Sincronizando etiquetas para conversación ${conversationId}`);
        console.log(`📋 Etiquetas objetivo:`, labelNames);

        // 🔥 PASO 1: OBTENER ETIQUETAS ACTUALES
        const convoData = await safeChatwootRequest(() =>
            axios.get(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
                { headers, timeout: 5000 }
            )
        );

        const etiquetasActuales = convoData.data?.labels || [];
        console.log(`📋 Etiquetas actuales:`, etiquetasActuales);

        // 🔥 PASO 2: ELIMINAR TODAS LAS ETIQUETAS ACTUALES (una por una)
        for (const labelName of etiquetasActuales) {
            try {
                await safeChatwootRequest(() =>
                    axios.post(
                        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
                        { labels: [labelName] },
                        {
                            headers,
                            timeout: 5000,
                            params: { remove: true }
                        }
                    )
                );
                console.log(`🗑️ Etiqueta eliminada: ${labelName}`);
            } catch (err) {
                console.error(`⚠️ Error eliminando etiqueta ${labelName}:`, err.message);
            }
        }

        // 🔥 PASO 3: AGREGAR NUEVAS ETIQUETAS (si hay)
        if (labelNames.length > 0) {
            await safeChatwootRequest(() =>
                axios.post(
                    `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
                    { labels: labelNames },
                    { headers, timeout: 5000 }
                )
            );
            console.log(`✅ Nuevas etiquetas agregadas: [${labelNames.join(", ")}]`);
        } else {
            console.log(`✨ Sin etiquetas nuevas (cliente completado)`);
        }

    } catch (err) {
        console.error(`⚠️ Error reemplazando etiquetas:`, err.message);
        console.error(`⚠️ Status:`, err.response?.status);
    }
}

// ===============================
// 📊 GESTIÓN DE ATRIBUTOS
// ===============================

export async function actualizarAtributosCliente(phone) {
    try {
        console.log(`📊 Actualizando atributos para ${phone}...`);

        const pedidosActivos = await getPedidosActivosByPhone(phone);
        const pedidosConDeuda = await getPedidosConDeuda(phone);
        const historico = await getTotalGastadoHistorico(phone);

        // ========================================
        // ATRIBUTOS DE CONTACTO (histórico + deudas)
        // ========================================
        const deudaTotal = pedidosConDeuda.reduce(
            (sum, p) => sum + Number(p.saldo_pendiente),
            0
        );

        const deudaDetalle = pedidosConDeuda.length > 0
            ? pedidosConDeuda.map(p =>
                `• ${p.order_code}: ${p.descripcion_trabajo}\n  Saldo: $${Number(p.saldo_pendiente).toLocaleString()}`
            ).join('\n\n')
            : "Ninguno";

        const atributosContacto = {
            total_pedidos_historico: String(historico.total_pedidos || 0),
            total_gastado_historico: String(historico.total_gastado || 0),
            cliente_desde: historico.cliente_desde?.toISOString().split('T')[0] || "",
            deuda_total: String(deudaTotal),
            cantidad_pedidos_con_deuda: String(pedidosConDeuda.length),
            pedidos_con_deuda_detalle: deudaDetalle
        };

        await actualizarAtributosContacto(phone, atributosContacto);

        // ========================================
        // ATRIBUTOS DE CONVERSACIÓN (pedidos activos)
        // ========================================
        if (pedidosActivos.length > 0) {
            const saldoTotalActivos = pedidosActivos.reduce(
                (sum, p) => sum + Number(p.saldo_pendiente),
                0
            );

            const ultimoPedido = pedidosActivos[0];

            const atributosConversacion = {
                pedidos_activos: pedidosActivos.map(p => p.order_code).join(", "),
                total_pedidos_activos: String(pedidosActivos.length),
                saldo_total_activos: String(saldoTotalActivos),
                ultimo_pedido: ultimoPedido.order_code,
                ultimo_trabajo: ultimoPedido.descripcion_trabajo,
                ultimo_estado: ultimoPedido.estado_pedido,
                ultimo_saldo: String(ultimoPedido.saldo_pendiente),
                ultima_actualizacion: new Date().toISOString()
            };

            await actualizarAtributosConversacion(phone, atributosConversacion);
        } else {
            // Limpiar atributos de conversación si no hay pedidos activos
            await actualizarAtributosConversacion(phone, {
                pedidos_activos: "Ninguno",
                total_pedidos_activos: "0",
                saldo_total_activos: "0",
                ultimo_pedido: "",
                ultimo_trabajo: "",
                ultimo_estado: "",
                ultimo_saldo: "0",
                ultima_actualizacion: new Date().toISOString()
            });
        }

        console.log(`✅ Atributos actualizados correctamente`);

    } catch (err) {
        console.error(`⚠️ Error actualizando atributos:`, err.message);
    }
}

async function actualizarAtributosContacto(phone, attributes) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);

        await safeChatwootRequest(() =>
            axios.put(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}`,
                { custom_attributes: attributes },
                { headers, timeout: 5000 }
            )
        );

        console.log(`📋 Atributos de contacto actualizados`);
    } catch (err) {
        console.error(`⚠️ Error actualizando atributos de contacto:`, err.message);
    }
}

async function actualizarAtributosConversacion(phone, attributes) {
    try {
        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);
        const conversationId = await getOrCreateConversation(e164, contactId);

        if (!conversationId) return;

        await safeChatwootRequest(() =>
            axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
                { custom_attributes: attributes },
                { headers, timeout: 5000 }
            )
        );

        console.log(`📋 Atributos de conversación actualizados`);
    } catch (err) {
        console.error(`⚠️ Error actualizando atributos de conversación:`, err.message);
    }
}

// ===============================
// 📥 FORWARD MENSAJES
// ===============================

export async function forwardToChatwoot(phone, name, messageObject) {
    try {
        console.log(`📥 forwardToChatwoot: ${phone} → "${messageObject.text?.body?.substring(0, 30) || messageObject.type}"`);

        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, name);
        if (!contactId) {
            console.error("❌ No se pudo obtener contactId, abortando");
            return;
        }

        const conversationId = await getOrCreateConversation(e164, contactId);
        if (!conversationId) {
            console.error("❌ No se pudo obtener conversationId, abortando");
            return;
        }

        const type = messageObject.type;
        const supportedMedia = ["image", "audio", "document", "video"];

        if (supportedMedia.includes(type)) {
            const mediaData = messageObject[type];
            const caption = mediaData.caption || "";

            console.log(`📎 Procesando multimedia tipo: ${type}`);

            const mediaMeta = await axios.get(`https://graph.facebook.com/v20.0/${mediaData.id}`, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
                timeout: 5000
            });

            const fileStream = await axios.get(mediaMeta.data.url, {
                headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
                responseType: 'arraybuffer',
                timeout: 10000
            });

            const form = new FormData();
            form.append('content', caption);
            form.append('message_type', 'incoming');

            const extension = mediaMeta.data.mime_type.split('/')[1] || 'bin';
            const fileName = mediaData.filename || `whatsapp_${type}_${Date.now()}.${extension}`;

            form.append('attachments[]', Buffer.from(fileStream.data), {
                filename: fileName,
                contentType: mediaMeta.data.mime_type
            });

            await safeChatwootRequest(() =>
                axios.post(
                    `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
                    form,
                    {
                        headers: { ...headers, ...form.getHeaders() },
                        timeout: 10000
                    }
                )
            );
            console.log(`✅ Multimedia enviado a Chatwoot`);
            return;
        }

        let content = messageObject.text?.body;
        if (!content && messageObject.interactive) {
            const reply = messageObject.interactive.button_reply || messageObject.interactive.list_reply;
            content = reply?.title || "Selección de menú";
        }

        if (content) {
            await safeChatwootRequest(() =>
                axios.post(
                    `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
                    { content: content, message_type: "incoming" },
                    { headers, timeout: 5000 }
                )
            );
            console.log(`✅ Mensaje del cliente enviado: "${content.substring(0, 50)}"`);
        }
    } catch (err) {
        console.error("❌ Error forwardToChatwoot:", err.message);
    }
}

export async function sendBotMessageToChatwoot(phone, text) {
    try {
        console.log(`📤 sendBotMessageToChatwoot: ${phone} → "${text.substring(0, 30)}"`);

        const e164 = toE164(phone);
        const contactId = await getOrCreateContact(e164, e164);
        if (!contactId) return;

        const conversationId = await getOrCreateConversation(e164, contactId);
        if (!conversationId) return;

        const res = await safeChatwootRequest(() =>
            axios.post(
                `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
                { content: text, message_type: "outgoing", private: false },
                { headers, timeout: 5000 }
            )
        );

        if (res.data?.id) {
            lastSentMessages.add(res.data.id);
            setTimeout(() => lastSentMessages.delete(res.data.id), 10000);
            console.log(`✅ Mensaje del bot enviado a Chatwoot`);
        }
    } catch (err) {
        console.error("❌ Error sendBotMessageToChatwoot:", err.message);
    }
}