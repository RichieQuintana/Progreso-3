# IntegraHub — Ecosistema de Gestión de Pedidos ✅

**Descripción breve**
IntegraHub es un ecosistema de microservicios orientado a la gestión de pedidos con arquitectura basada en eventos. Implementa patrones de resiliencia (Circuit Breaker), Outbox, colas con DLQ/retry, idempotencia y autenticación JWT. Está diseñado para desplegarse localmente con Docker Compose.

---

## 🔧 Componentes principales

- **`orders-api`** (`orders-api/`)
  - API REST para crear y consultar pedidos.
  - Endpoints clave: `POST /orders`, `GET /orders`, `GET /health`, `GET /login-demo`, `/api-docs` (Swagger).
  - Implementa: Outbox pattern, circuit breaker para BD, publicación a exchange `order_events`.

- **`order-worker`** (`order-worker/`)
  - Consume eventos `order_created` y procesa el pedido (inventario, pago, confirmación).
  - Maneja DLX/DLQ, cola de retry, idempotencia, logging de eventos y notificaciones.
  - Observa carpeta `order-worker/inbox` para integración por archivos (Flujo C).

- **`notification-service`** (`notification-service/`)
  - Consumidor Pub/Sub que recibe eventos `OrderConfirmed`/`OrderRejected` y simula notificaciones a operaciones/cliente.

- **`inventory-ingestor`** (`inventory-ingestor/`)
  - Observa `csv-inbox/` y procesa CSVs con columnas `sku,name,quantity`, actualiza tabla `inventory`. Archiva en `processed/` o `errors/`.

- **`auth-service`** (`auth-service/`)
  - Emite tokens con flujo `client_credentials` (demo). Endpoint: `POST /token`.

- **Infra & utilidades**
  - Postgres con esquema en `sql/init.sql`.
  - RabbitMQ (UI en puerto `15672`).
  - Demo Portal: contenido estático en `orders-api/public` servido por nginx (puerto `80`).
  - Script de prueba: `scripts/test_pubsub.sh`.
  - Colección Postman: `postman/integrahub-postman-collection.json`.

---

## ⚙️ Patrones y características clave

- **Outbox pattern**: asegura atomicidad DB→evento (tabla `outbox` + flusher que publica).
  
- **Circuit Breakers**: `opossum` para DB, inventario y pago (evita cascada de fallos).
  
- **DLX / DLQ / Retry queue**: para reintentos y aislamiento de fallos permanentes.
  
- **Idempotencia**: comprobación antes de procesar pedidos.
  
- **Seguridad**: JWT demo (`/login-demo`) y servidor auth para OAuth2 `client_credentials`.
  
- **Observabilidad**: `GET /health`, `GET /circuit-status`, logs por servicio, RabbitMQ Management, Swagger UI.

---

## 🧰 Requisitos previos

- Docker y Docker Compose instalados.
- 
- No es necesario Node.js local; todo corre en contenedores.

---

## 🚀 Arranque rápido (Local)

1. En la raíz del proyecto:

```bash

docker compose up -d --build
```

2. Verificar servicios:
   
- Swagger: http://localhost:9000/api-docs
  
- Demo Portal: http://localhost
  
- RabbitMQ UI: http://localhost:15672 (user: `admin`, pass: `admin_pass`)
  
- Auth service: http://localhost:4000
  
- Health API: http://localhost:9000/health

3. Ver logs:
   
```bash
docker compose logs -f orders-api

docker compose logs -f order-worker

docker compose logs -f notification-service
```


