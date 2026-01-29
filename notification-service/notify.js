const amqp = require('amqplib');

async function startNotifier() {
  try {
    const RABBIT_URL = `amqp://admin:admin_pass@${process.env.RABBIT_HOST || 'rabbitmq'}`;
    const conn = await amqp.connect(RABBIT_URL);
    const channel = await conn.createChannel();

    await channel.assertExchange('order_events', 'fanout', { durable: true });

    // Cola exclusiva con nombre aleatorio para este consumidor
    const q = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(q.queue, 'order_events', '');

    console.log('[*] Notification Service: escuchando eventos en exchange `order_events`');

    channel.consume(q.queue, (msg) => {
      if (msg !== null) {
        try {
          const event = JSON.parse(msg.content.toString());
          console.log('\n--- Evento recibido en Notification Service ---');
          console.log('Tipo:', event.eventType);
          console.log('Pedido:', event.orderId || event.id);

          if (event.eventType === 'OrderConfirmed') {
            console.log('➡️ Notificar a OPERACIONES (webhook simulado)');
            console.log(`   Mensaje: Pedido ${event.orderId} confirmado por $${event.amount}`);
            console.log('➡️ Notificar a CLIENTE (email simulado)');
            console.log(`   Para: ${event.customer || 'Cliente'}`);
          } else if (event.eventType === 'OrderRejected') {
            console.log('➡️ Notificar a OPERACIONES (webhook simulado)');
            console.log(`   Mensaje: Pedido ${event.orderId} RECHAZADO: ${event.reason}`);
            console.log('➡️ Notificar a CLIENTE (email simulado)');
            console.log(`   Para: Cliente`);
          } else if (event.eventType === 'OrderCreated') {
            console.log('➡️ Evento de creación recibido, listo para otros consumidores');
          }

          channel.ack(msg);
        } catch (err) {
          console.error('[Notification] Error procesando evento:', err.message);
          channel.ack(msg);
        }
      }
    });

  } catch (err) {
    console.error('[Notification] No se pudo conectar a RabbitMQ. Reintentando en 5s...');
    setTimeout(startNotifier, 5000);
  }
}

startNotifier();
