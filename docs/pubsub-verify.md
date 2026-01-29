# Verificación Pub/Sub

Pasos rápidos para verificar la integración localmente:

1. Levantar servicios:
   docker compose up --build

2. Obtener token demo:
   curl http://localhost:9000/login-demo

3. Crear pedido (ejemplo):
   curl -X POST http://localhost:9000/orders -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"id":"test1","customer_name":"Alice","total_amount":100}'

4. Revisar logs:
   - `order_worker` debe procesar y publicar eventos `OrderConfirmed` o `OrderRejected`.
   - `notification-service` debe mostrar notificaciones simuladas en su log.

5. Para probar Inbox (Flujo C): copiar JSONs del folder `order-worker/inbox` al mismo folder montado para que el worker los consuma.
