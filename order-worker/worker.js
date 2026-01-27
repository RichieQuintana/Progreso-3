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
        // Vinculamos la cola de fallos al exchange con la llave 'failed'
        await channel.bindQueue(DLQ, DLX, 'failed');

        // 2. Configuración de la Cola Principal
        const mainQueue = 'order_created';
        await channel.assertQueue(mainQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': 'failed'
            }
        });

        console.log(" [*] Worker activo. Monitoreando 'inbox' y cola 'order_created'...");

        // --- FLUJO C: Integración por Archivos ---

    fs.watch(inboxPath, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
            const filePath = path.join(inboxPath, filename);
            
            // Pequeña pausa para asegurar que Windows terminó de escribir el archivo
            setTimeout(() => {
                try {
                    const data = fs.readFileSync(filePath, 'utf8');
                    channel.sendToQueue('order_created', Buffer.from(data));
                    console.log(`[Flujo C] Ingestado: ${filename}`);
                    
                    // Intentar borrar el archivo
                    fs.unlinkSync(filePath); 
                } catch (err) {
                    console.error("Error al procesar archivo del inbox:", err.message);
                }
            }, 100);
        }
    });

        // --- PROCESAMIENTO DE MENSAJES (Reglas de Negocio) ---
    channel.consume(mainQueue, (msg) => {
        if (msg !== null) {
            const order = JSON.parse(msg.content.toString());
            
            // Convertimos a número para asegurar la comparación
            const monto = Number(order.total_amount);

            console.log(`Checking order ${order.id} with amount: ${monto}`);

            if (monto < 0) {
                // REGLA DE ORO: Si es negativo, lanzamos a la DLQ
                console.log(` [!] DETECTADO NEGATIVO: Pedido ${order.id} rechazado.`);
                
                // nack(mensaje, requeue=false, multiple=false)
                // Al ser requeue=false, RabbitMQ lo manda a la DLQ configurada
                channel.nack(msg, false, false); 
            } else {
                console.log(` [OK] Pedido ${order.id} procesado correctamente.`);
                channel.ack(msg);
            }
        }
    });

    } catch (err) {
        console.error(" [!] Error de conexión en el Worker. Reintentando en 5 segundos...");
        setTimeout(startWorker, 5000);
    }
}

startWorker();