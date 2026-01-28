const amqp = require('amqplib');
const fs = require('fs');
const path = require('path');

// Configuración de rutas para archivos legados (Flujo C)
const inboxPath = path.join(__dirname, 'inbox');

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

        console.log(" [*] Worker activo. Monitoreando 'inbox' y cola 'order_created'...");

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

        // --- PROCESAMIENTO DE MENSAJES (Reglas de Negocio) ---
        channel.consume(mainQueue, (msg) => {
            if (msg !== null) {
                try {
                    const order = JSON.parse(msg.content.toString());
                    
                    // CORRECCIÓN: Extraer ID y Monto de forma robusta
                    const id = order.id || order.orderId || "N/A";
                    const monto = Number(order.total_amount || order.amount);

                    console.log(`Checking order ${id} with amount: ${monto}`);

                    if (isNaN(monto) || monto < 0) {
                        // REGLA: Si el monto es negativo o inválido, enviar a DLQ
                        console.log(` [!] RECHAZADO: Pedido ${id} (Monto: ${monto}). Movido a DLQ.`);
                        // nack con requeue=false activa la transferencia a la DLQ
                        channel.nack(msg, false, false); 
                    } else {
                        console.log(` [OK] Pedido ${id} procesado correctamente.`);
                        channel.ack(msg);
                    }
                } catch (parseError) {
                    console.error(" [!] Error de formato en mensaje, descartando...");
                    channel.nack(msg, false, false);
                }
            }
        });

    } catch (err) {
        console.error(" [!] Error en el Worker. Reintentando en 5 segundos...");
        setTimeout(startWorker, 5000); // Resiliencia con reintentos
    }
}

startWorker();