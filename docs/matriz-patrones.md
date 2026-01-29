# Matriz de Patrones de Integración

## Patrones Implementados

| # | Patrón | Dónde se usa | Por qué | Trade-off | Evidencia |
|---|--------|--------------|---------|-----------|-----------|
| 1 | **Point-to-Point (Cola)** | `order_created` queue en RabbitMQ | Garantiza que cada mensaje sea procesado exactamente por un consumidor (el Worker) | (+) Procesamiento garantizado, ordenado (-) Un solo consumidor, posible cuello de botella | RabbitMQ UI: Queues > `order_created` |
| 2 | **Publish/Subscribe (Fanout)** | `order_events` exchange tipo fanout | Permite que múltiples consumidores reciban el mismo evento (Worker + Notificaciones) | (+) Desacoplamiento, extensibilidad (-) Duplicación de mensajes, más recursos | RabbitMQ UI: Exchanges > `order_events` |
| 3 | **Message Router** | Worker valida monto y decide: procesar o DLQ | Ruteo basado en contenido del mensaje (monto válido vs inválido) | (+) Lógica centralizada de ruteo (-) Acoplamiento a reglas de negocio | Logs del Worker: "RECHAZADO" vs "CONFIRMADO" |
| 4 | **Message Translator** | Worker mapea campos `orderId`/`id`, `amount`/`total_amount` | Normaliza diferentes formatos de mensaje (API vs Inbox) | (+) Flexibilidad con formatos (-) Complejidad adicional | `worker.js:64-66` extrae campos de forma robusta |
| 5 | **Dead Letter Channel** | `order_dlx` + `order_dead_letter_queue` | Mensajes fallidos no se pierden, van a cola especial | (+) No hay pérdida de datos, debugging (-) Requiere proceso de recuperación manual | RabbitMQ UI: Queues > `order_dead_letter_queue` |
| 6 | **Idempotent Consumer** | `POST /orders` verifica ID duplicado antes de insertar | Evita duplicación de pedidos ante reintentos | (+) Consistencia de datos (-) Query adicional por request | Swagger: POST con mismo ID retorna 409 Conflict |

## Patrones de Resiliencia

| Patrón | Implementación | Evidencia |
|--------|----------------|-----------|
| **Retry con Backoff** | `setTimeout(startWorker, 5000)` en conexión fallida | Logs: "Reintentando en 5 segundos..." |
| **Circuit Breaker** | Librería `opossum` en Orders API | `/circuit-status` endpoint, `/health` muestra estado |
| **Timeout** | `circuitOptions.timeout = 5000` | Circuit Breaker abre tras 5s sin respuesta |
| **Health Check** | `/health` endpoint consolidado | Demo Portal muestra estado del sistema |

## Patrones de Seguridad

| Patrón | Implementación | Evidencia |
|--------|----------------|-----------|
| **Token-based Auth (JWT)** | Middleware `authenticateJWT` en rutas protegidas | Swagger: 401 sin token, 200 con token |
| **Bearer Token** | Header `Authorization: Bearer <token>` | Demo Portal obtiene token automáticamente |

## Patrones de Integración de Datos

| Patrón | Implementación | Evidencia |
|--------|----------------|-----------|
| **File Transfer** | Worker monitorea `/inbox` con `fs.watch()` | Copiar JSON a inbox -> aparece en logs |
| **Batch/ETL** | `/analytics` agrega datos de PostgreSQL | Swagger: GET /analytics retorna métricas |

## Detalle de Trade-offs

### 1. RabbitMQ vs Kafka
- **Elegimos RabbitMQ** porque:
  - Más simple para colas de trabajo y Pub/Sub básico
  - Management UI incluida para demo
  - Menor curva de aprendizaje
- **Trade-off**: Kafka sería mejor para alto volumen y streaming en tiempo real

### 2. JWT vs OAuth2 completo
- **Elegimos JWT simple** porque:
  - Suficiente para demo de autenticación
  - No requiere servidor OAuth externo
- **Trade-off**: OAuth2 completo daría refresh tokens y scopes

### 3. Simuladores vs Servicios Reales
- **Elegimos simuladores** (inventario, pago) porque:
  - Permite demo controlada de fallos
  - No depende de servicios externos
- **Trade-off**: No representa integración real con proveedores

### 4. Circuit Breaker en API vs Worker
- **Implementamos en API** porque:
  - Protege el punto de entrada del sistema
  - Responde rápido al cliente cuando BD falla
- **Trade-off**: Worker podría beneficiarse también, pero prioriza reintentos

## Cómo Evidenciar en Demo

1. **P2P + Pub/Sub**: RabbitMQ UI > Exchanges y Queues
2. **DLQ**: Crear pedido con monto negativo, ver en `order_dead_letter_queue`
3. **Idempotencia**: Mismo POST dos veces = 409 Conflict
4. **Circuit Breaker**: `docker stop postgres_db`, luego GET /health
5. **JWT**: POST /orders sin token = 401, con token = 201
