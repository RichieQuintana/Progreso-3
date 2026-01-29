# Diagrama de Secuencia: Create Order (E2E)

## Flujo Exitoso (Happy Path)

```
Usuario          Demo Portal       Orders API        RabbitMQ         Worker           PostgreSQL
   |                  |                 |                |                |                  |
   |  1. Click       |                 |                |                |                  |
   |  "Crear Pedido" |                 |                |                |                  |
   |---------------->|                 |                |                |                  |
   |                 |                 |                |                |                  |
   |                 | 2. GET /login-demo               |                |                  |
   |                 |---------------->|                |                |                  |
   |                 |                 |                |                |                  |
   |                 | 3. JWT Token    |                |                |                  |
   |                 |<----------------|                |                |                  |
   |                 |                 |                |                |                  |
   |                 | 4. POST /orders |                |                |                  |
   |                 | (Bearer Token)  |                |                |                  |
   |                 |---------------->|                |                |                  |
   |                 |                 |                |                |                  |
   |                 |                 | 5. Validar JWT |                |                  |
   |                 |                 |--------------->|                |                  |
   |                 |                 |                |                |                  |
   |                 |                 | 6. Check Idempotencia           |                  |
   |                 |                 |-------------------------------------------------->|
   |                 |                 |                |                |                  |
   |                 |                 | 7. ID no existe (OK)            |                  |
   |                 |                 |<--------------------------------------------------|
   |                 |                 |                |                |                  |
   |                 |                 | 8. INSERT order (RECEIVED)      |                  |
   |                 |                 |-------------------------------------------------->|
   |                 |                 |                |                |                  |
   |                 |                 | 9. Publish OrderCreated         |                  |
   |                 |                 |--------------->|                |                  |
   |                 |                 |                |                |                  |
   |                 | 10. 201 Created |                |                |                  |
   |                 |<----------------|                |                |                  |
   |                 |                 |                |                |                  |
   | 11. Mostrar     |                 |                |                |                  |
   |     confirmacion|                 |                |                |                  |
   |<----------------|                 |                |                |                  |
   |                 |                 |                |                |                  |
   |                 |                 |                | 12. Consume    |                  |
   |                 |                 |                |     message    |                  |
   |                 |                 |                |--------------->|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 13. Check        |
   |                 |                 |                |                |     Inventory    |
   |                 |                 |                |                |-------+          |
   |                 |                 |                |                |       |          |
   |                 |                 |                |                |<------+          |
   |                 |                 |                |                | (OK)             |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 14. UPDATE       |
   |                 |                 |                |                | INVENTORY_RESERVED
   |                 |                 |                |                |----------------->|
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 15. Process      |
   |                 |                 |                |                |     Payment      |
   |                 |                 |                |                |-------+          |
   |                 |                 |                |                |       |          |
   |                 |                 |                |                |<------+          |
   |                 |                 |                |                | (OK)             |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 16. UPDATE       |
   |                 |                 |                |                | CONFIRMED        |
   |                 |                 |                |                |----------------->|
   |                 |                 |                |                |                  |
   |                 |                 |                | 17. Publish    |                  |
   |                 |                 |                | OrderConfirmed |                  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                | 18. Notify     |                  |
   |                 |                 |                | Operations +   |                  |
   |                 |                 |                | Customer       |                  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
   |                 |                 |                |                | 19. ACK message  |
   |                 |                 |                |<---------------|                  |
   |                 |                 |                |                |                  |
```

## Notas del Flujo

1. **Autenticación**: El Demo Portal primero obtiene un token JWT
2. **Idempotencia**: La API verifica que el Order ID no exista antes de crear
3. **Pub/Sub**: El evento se publica en un exchange fanout
4. **Procesamiento Asíncrono**: El Worker procesa inventario y pago
5. **Trazabilidad**: Cada paso se registra en la tabla `order_events`
6. **Notificaciones**: Se envían webhooks simulados tras confirmar/rechazar
