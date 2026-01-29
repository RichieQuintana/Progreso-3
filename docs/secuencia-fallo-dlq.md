# Diagrama de Secuencia: Fallo + Retry + DLQ + Recuperación

## Flujo de Error con Dead Letter Queue

<img width="1007" height="976" alt="image" src="https://github.com/user-attachments/assets/32ad3b70-ff6f-4dfd-86e5-994bdd6dcfd7" />


## Escenario: Fallo de Inventario

<img width="593" height="568" alt="image" src="https://github.com/user-attachments/assets/b8f4c2e0-4efa-403a-b5cd-96c90dceb0aa" />

## Escenario: Fallo de Pago

<img width="778" height="777" alt="image" src="https://github.com/user-attachments/assets/57f67cd9-badd-4c69-b8eb-f4067979fb85" />

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
