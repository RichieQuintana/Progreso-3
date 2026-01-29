# Verificar Outbox Pattern

1. Levantar servicios:
   docker compose up --build -d

2. Crear un pedido (PowerShell):
   $token = (Invoke-RestMethod http://localhost:9000/login-demo).token
   Invoke-RestMethod -Method Post -Uri 'http://localhost:9000/orders' -Headers @{Authorization="Bearer $token"} -Body (@{id='outbox-'+(Get-Date -UFormat %s); customer_name='Outbox Test'; total_amount=10} | ConvertTo-Json) -ContentType 'application/json'

3. Verificar tabla outbox:
   docker exec -it postgres_db psql -U user_admin -d orders_db -c "SELECT id, event_type, published, tries FROM outbox ORDER BY id DESC LIMIT 10;"

4. Revisar logs de `orders-api` y RabbitMQ UI para ver publicación y que `outbox.published = true` tras flush.

5. Para probar falla de broker: detener rabbitmq (docker compose stop rabbitmq), crear pedido, verificar que outbox.published = false, volver a levantar rabbitmq y esperar que `orders-api` flusher publique y marque como true.
