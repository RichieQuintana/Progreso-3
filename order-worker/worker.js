const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuración de rutas para archivos legados (Flujo C)
const inboxPath = path.join(__dirname, 'inbox');

// Conexión a Base de Datos para actualizar estados
const pool = new Pool({
    user: process.env.DB_USER || 'user_admin',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'orders_db',
    password: process.env.DB_PASSWORD || 'secret_password',
    port: 5432,
});

// --- SIMULADORES DE SERVICIOS EXTERNOS ---

// Simulador de Inventario (70% éxito)
function checkInventory(orderId, amount) {
    const available = Math.random() > 0.3; // 70% probabilidad de éxito
    console.log(`   [Inventario] Pedido ${orderId}: ${available ? 'DISPONIBLE' : 'SIN STOCK'}`);
    return available;
}

// Simulador de Pago (80% éxito si monto > 0)
function processPayment(orderId, amount) {
    if (amount <= 0) return false;
    const success = Math.random() > 0.2; // 80% probabilidad de éxito
    console.log(`   [Pago] Pedido ${orderId}: ${success ? 'APROBADO' : 'RECHAZADO'}`);
    return success;
}

// Actualizar estado del pedido en BD
async function updateOrderStatus(orderId, status) {
    try {
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        console.log(`   [BD] Pedido ${orderId} -> Estado: ${status}`);
    } catch (err) {
        console.error(`   [BD] Error actualizando pedido ${orderId}:`, err.message);
    }
}

// Registrar evento en tabla order_events (Trazabilidad)
async function logOrderEvent(orderId, eventType, payload) {
    try {
        await pool.query(
            'INSERT INTO order_events (order_id, event_type, payload) VALUES ($1, $2, $3)',
            [orderId, eventType, JSON.stringify(payload)]
        );
        console.log(`   [Evento] ${eventType} registrado para pedido ${orderId}`);
    } catch (err) {
        console.error(`   [Evento] Error registrando evento:`, err.message);
    }
}

// --- FLUJO B: SERVICIO DE NOTIFICACIONES (Pub/Sub) ---

// Simulador de Webhook a Slack/Discord (Operaciones)
function notifyOperations(event) {
    console.log(`\n📢 [WEBHOOK OPERACIONES]`);
    console.log(`   Tipo: ${event.eventType}`);
    console.log(`   Pedido: ${event.orderId}`);
    console.log(`   Mensaje: ${event.eventType === 'OrderConfirmed'
        ? `✅ Pedido confirmado por $${event.amount}`
        : `❌ Pedido rechazado: ${event.reason}`}`);
    console.log(`   Timestamp: ${event.timestamp}`);
    // En producción: axios.post('https://hooks.slack.com/...', payload)
}

// Simulador de Notificación al Cliente
function notifyCustomer(event) {
    console.log(`\n📧 [NOTIFICACIÓN CLIENTE]`);
    if (event.eventType === 'OrderConfirmed') {
        console.log(`   Para: ${event.customer || 'Cliente'}`);
        console.log(`   Asunto: ¡Tu pedido ha sido confirmado!`);
        console.log(`   Cuerpo: Tu pedido #${event.orderId} por $${event.amount} está en proceso.`);
    } else if (event.eventType === 'OrderRejected') {
        console.log(`   Para: Cliente`);
        console.log(`   Asunto: Problema con tu pedido`);
        console.log(`   Cuerpo: Tu pedido #${event.orderId} no pudo procesarse: ${event.reason}`);
    }
    // En producción: sendEmail(customer.email, subject, body)
}

async function startWorker() {
    try {
        console.log(" [*] Conectando a RabbitMQ...");
        const RABBIT_URL = `amqp://admin:admin_pass@${process.env.RABBIT_HOST || 'rabbitmq'}`;
        const conn = await amqp.connect(RABBIT_URL);
        const channel = await conn.createChannel();

        // 1. Configuración de Resiliencia (Dead Letter Exchange)
        const DLX = 'order_dlx';
        const DLQ = 'order_dead_letter_queue';
        
        await channel.assertExchange(DLX, 'direct', { durable: true });
        await channel.assertQueue(DLQ, { durable: true });
        await channel.bindQueue(DLQ, DLX, 'failed');

        // 2. Configuración de la Cola Principal con enlace a DLX
        const mainQueue = 'order_created';
        await channel.assertQueue(mainQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': 'failed'
            }
        });

        await channel.assertExchange('order_events', 'fanout', { durable: true });
        await channel.bindQueue(mainQueue, 'order_events', '');

        // 3. Cola de Notificaciones (Flujo B - Pub/Sub)
        const notificationsQueue = 'order_notifications';
        await channel.assertQueue(notificationsQueue, { durable: true });
        await channel.bindQueue(notificationsQueue, 'order_events', '');

        console.log(" [*] Worker activo. Monitoreando 'inbox', 'order_created' y 'notifications'...");

        // --- FLUJO C: Integración por Archivos ---
        fs.watch(inboxPath, (eventType, filename) => {
            if (filename && filename.endsWith('.json')) {
                const filePath = path.join(inboxPath, filename);
                setTimeout(() => {
                    try {
                        if (fs.existsSync(filePath)) {
                            const data = fs.readFileSync(filePath, 'utf8');
                            channel.sendToQueue(mainQueue, Buffer.from(data), { persistent: true });
                            console.log(`[Flujo C] Archivo ingestado: ${filename}`);
                            fs.unlinkSync(filePath); 
                        }
                    } catch (err) {
                        console.error("Error al procesar archivo del inbox:", err.message);
                    }
                }, 200);
            }
        });

        // --- PROCESAMIENTO DE MENSAJES (Flujo A Completo) ---
        channel.consume(mainQueue, async (msg) => {
            if (msg !== null) {
                try {
                    const order = JSON.parse(msg.content.toString());

                    // Extraer datos del pedido
                    const id = order.id || order.orderId || "N/A";
                    const monto = Number(order.total_amount || order.amount);
                    const customer = order.customer_name || order.customer || "Unknown";

                    console.log(`\n========== PROCESANDO PEDIDO ==========`);
                    console.log(`ID: ${id} | Cliente: ${customer} | Monto: $${monto}`);

                    // PASO 1: Validación básica
                    if (isNaN(monto) || monto < 0) {
                        console.log(` [!] RECHAZADO: Monto inválido (${monto}). -> DLQ`);
                        await updateOrderStatus(id, 'REJECTED');
                        await logOrderEvent(id, 'OrderRejected', { reason: 'Invalid amount', amount: monto });

                        // Publicar evento OrderRejected
                        channel.publish('order_events', '', Buffer.from(JSON.stringify({
                            eventType: 'OrderRejected',
                            orderId: id,
                            reason: 'Invalid amount',
                            timestamp: new Date().toISOString()
                        })), { persistent: true });

                        channel.nack(msg, false, false);
                        return;
                    }

                    // PASO 2: Validar Inventario (Requisito 3.1.3)
                    const inventoryOk = checkInventory(id, monto);
                    if (!inventoryOk) {
                        console.log(` [!] RECHAZADO: Sin inventario disponible. -> DLQ`);
                        await updateOrderStatus(id, 'REJECTED');
                        await logOrderEvent(id, 'OrderRejected', { reason: 'Insufficient inventory' });

                        channel.publish('order_events', '', Buffer.from(JSON.stringify({
                            eventType: 'OrderRejected',
                            orderId: id,
                            reason: 'Insufficient inventory',
                            timestamp: new Date().toISOString()
                        })), { persistent: true });

                        channel.nack(msg, false, false);
                        return;
                    }

                    await updateOrderStatus(id, 'INVENTORY_RESERVED');
                    await logOrderEvent(id, 'InventoryReserved', { orderId: id });

                    // PASO 3: Procesar Pago (Requisito 3.1.4)
                    const paymentOk = processPayment(id, monto);
                    if (!paymentOk) {
                        console.log(` [!] RECHAZADO: Pago fallido. -> DLQ`);
                        await updateOrderStatus(id, 'PAYMENT_FAILED');
                        await logOrderEvent(id, 'OrderRejected', { reason: 'Payment failed' });

                        channel.publish('order_events', '', Buffer.from(JSON.stringify({
                            eventType: 'OrderRejected',
                            orderId: id,
                            reason: 'Payment failed',
                            timestamp: new Date().toISOString()
                        })), { persistent: true });

                        channel.nack(msg, false, false);
                        return;
                    }

                    await updateOrderStatus(id, 'PAYMENT_PROCESSED');
                    await logOrderEvent(id, 'PaymentProcessed', { orderId: id, amount: monto });

                    // PASO 4: Confirmar Pedido (Requisito 3.1.5)
                    await updateOrderStatus(id, 'CONFIRMED');
                    await logOrderEvent(id, 'OrderConfirmed', { orderId: id, customer, amount: monto });

                    // Publicar evento OrderConfirmed
                    channel.publish('order_events', '', Buffer.from(JSON.stringify({
                        eventType: 'OrderConfirmed',
                        orderId: id,
                        customer: customer,
                        amount: monto,
                        timestamp: new Date().toISOString()
                    })), { persistent: true });

                    console.log(` [✓] PEDIDO CONFIRMADO: ${id}`);
                    console.log(`=====================================\n`);
                    channel.ack(msg);

                } catch (parseError) {
                    console.error(" [!] Error de formato en mensaje, descartando...");
                    channel.nack(msg, false, false);
                }
            }
        });

        // --- FLUJO B: CONSUMIDOR DE NOTIFICACIONES ---
        channel.consume(notificationsQueue, (msg) => {
            if (msg !== null) {
                try {
                    const event = JSON.parse(msg.content.toString());

                    // Solo procesar eventos de confirmación/rechazo
                    if (event.eventType === 'OrderConfirmed' || event.eventType === 'OrderRejected') {
                        notifyOperations(event);  // Webhook a Operaciones
                        notifyCustomer(event);    // Notificación al Cliente
                    }

                    channel.ack(msg);
                } catch (err) {
                    console.error(" [Notificaciones] Error procesando evento:", err.message);
                    channel.ack(msg); // Ack para no bloquear la cola
                }
            }
        });

    } catch (err) {
        console.error(" [!] Error en el Worker. Reintentando en 5 segundos...");
        setTimeout(startWorker, 5000); // Resiliencia con reintentos
    }
}

startWorker();