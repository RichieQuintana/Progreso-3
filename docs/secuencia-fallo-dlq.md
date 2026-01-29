# Diagrama de Secuencia: Fallo + Retry + DLQ + Recuperación

## Flujo de Error con Dead Letter Queue

```
Usuario          Demo Portal       Orders API        RabbitMQ         Worker           PostgreSQL
   |                  |                 |                |                |                  |
   |  1. Crear pedido |                 |                |                |                  |
   |  con monto       |                 |                |                |                  |
   |  NEGATIVO (-50)  |                 |                |                |                  |
   |---------------->|                 |                |                |                  |
   |                 |                 |                |                |                  |
   |                 | 2. POST /orders |                |                |                  |
   |                 | (monto: -50)    |                |                |                  |
   |                 |---------------->|                |                |                  |
   |                 |                 |                |                |                  |
   |                 |                 | 3. INSERT order (RECEIVED)      |                  |
   |                 |                 |-------------------------------------------------->|
   |                 |                 |                |                |                  |
   |                 |                 | 4. Publish OrderCreated         |                  |
   |                 |                 |--------------->|                |                  |
   |                 |                 |                |                |                  |
   |                 | 5. 201 Created  |                |                |                  |
   |                 |<----------------|                |                |                  |
   |                 |                 |                |                |                  |
   |                 |                 |                | 6. Deliver to  |                  |
   |                 |                 |                | order_created  |                  |
   |                 |                 |                |--------------->|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 7. Validate      |
   |                 |                 |                |                |    amount        |
   |                 |                 |                |                |-------+          |
   |                 |                 |                |                |       |          |
   |                 |                 |                |                |<------+          |
   |                 |                 |                |                | MONTO NEGATIVO!  |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 8. UPDATE        |
   |                 |                 |                |                | status=REJECTED  |
   |                 |                 |                |                |----------------->|
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 9. Log Event     |
   |                 |                 |                |                | OrderRejected    |
   |                 |                 |                |                |----------------->|
   |                 |                 |                |                |                  |
   |                 |                 |                | 10. Publish    |                  |
   |                 |                 |                | OrderRejected  |                  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 11. NACK         |
   |                 |                 |                |                | (requeue=false)  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                | 12. Route to   |                  |
   |                 |                 |                | DLX -> DLQ     |                  |
   |                 |                 |                |-------+        |                  |
   |                 |                 |                |       |        |                  |
   |                 |                 |                |<------+        |                  |
   |                 |                 |                | (message in    |                  |
   |                 |                 |                | dead_letter_   |                  |
   |                 |                 |                | queue)         |                  |
   |                 |                 |                |                |                  |
   |                 |                 |                | 13. Notify     |                  |
   |                 |                 |                | Operations     |                  |
   |                 |                 |                | (webhook)      |                  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                | 14. Notify     |                  |
   |                 |                 |                | Customer       |                  |
   |                 |                 |                | (email sim)    |                  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
```

## Escenario: Fallo de Inventario

```
Worker recibe mensaje
       |
       v
+------+-------+
| Check        |
| Inventory    |
| (Random 30%  |
|  falla)      |
+------+-------+
       |
       | SIN STOCK
       v
+------+-------+
| UPDATE order |
| status =     |
| REJECTED     |
+------+-------+
       |
       v
+------+-------+
| Publish      |
| OrderRejected|
| reason:      |
| "Insufficient|
|  inventory"  |
+------+-------+
       |
       v
+------+-------+
| NACK message |
| -> DLQ       |
+--------------+
```

## Escenario: Fallo de Pago

```
Worker recibe mensaje
       |
       v
+------+-------+
| Check        |
| Inventory    |
| -> OK        |
+------+-------+
       |
       v
+------+-------+
| UPDATE       |
| INVENTORY_   |
| RESERVED     |
+------+-------+
       |
       v
+------+-------+
| Process      |
| Payment      |
| (Random 20%  |
|  falla)      |
+------+-------+
       |
       | PAGO RECHAZADO
       v
+------+-------+
| UPDATE order |
| status =     |
| PAYMENT_     |
| FAILED       |
+------+-------+
       |
       v
+------+-------+
| Publish      |
| OrderRejected|
| reason:      |
| "Payment     |
|  failed"     |
+------+-------+
       |
       v
+------+-------+
| NACK message |
| -> DLQ       |
+--------------+
```

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
