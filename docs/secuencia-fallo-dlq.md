# Diagrama de Secuencia: Fallo + Retry + DLQ + Recuperación

## Flujo de Error con Dead Letter Queue

<img width="1007" height="976" alt="image" src="https://github.com/user-attachments/assets/32ad3b70-ff6f-4dfd-86e5-994bdd6dcfd7" />

## Escenario: Fallo de Inventario

<img width="737" height="629" alt="image" src="https://github.com/user-attachments/assets/3e47fe1e-ecb9-40e4-8e65-b9bbd2de4162" />

## Escenario: Fallo de Pago

<img width="790" height="728" alt="image" src="https://github.com/user-attachments/assets/d2a4ee2d-d304-47cf-99de-1a96ee0ce000" />

## Configuración DLQ

```javascript
// Dead Letter Exchange
const DLX = 'order_dlx';
const DLQ = 'order_dead_letter_queue';

// Cola principal con enlace a DLX
await channel.assertQueue('order_created', {
    durable: true,
    arguments: {
        'x-dead-letter-exchange': DLX,
        'x-dead-letter-routing-key': 'failed'
    }
});
```

## Visualización en RabbitMQ Management

1. Ir a http://localhost:15672
2. Pestaña "Queues"
3. Ver `order_dead_letter_queue` con mensajes fallidos
4. Click en "Get messages" para inspeccionar

## Recuperación Manual

Los mensajes en DLQ pueden:
1. Ser inspeccionados manualmente en RabbitMQ UI
2. Re-publicados a la cola principal tras corrección
3. Archivados para análisis posterior
