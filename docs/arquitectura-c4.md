# Arquitectura C4 - IntegraHub

## Nivel 1: Diagrama de Contexto

<img width="274" height="713" alt="image" src="https://github.com/user-attachments/assets/0d1a1ec2-fd0c-4cc7-a041-42df1c6bbe94" />

### Descripción
- **Cliente/Usuario**: Accede al Demo Portal para crear y monitorear pedidos
- **IntegraHub**: Plataforma central de integración que orquesta el flujo Order-to-Cash
- **Sistema Legado**: Sistemas externos que envían archivos a la carpeta inbox

---

## Nivel 2: Diagrama de Contenedores

```
+------------------------------------------------------------------+
|                         IntegraHub                                |
+------------------------------------------------------------------+
|                                                                   |
|  +-------------+     +-------------+     +------------------+     |
|  |             |     |             |     |                  |     |
|  | Demo Portal |---->| Orders API  |---->|    RabbitMQ      |     |
|  |   (Nginx)   |     |  (Node.js)  |     | (Message Broker) |     |
|  |   :80       |     |   :9000     |     |  :5672/:15672    |     |
|  +-------------+     +------+------+     +--------+---------+     |
|                             |                     |               |
|                             v                     v               |
|                      +------+------+     +--------+---------+     |
|                      |             |     |                  |     |
|                      | PostgreSQL  |<----|  Order Worker    |     |
|                      |    (DB)     |     |    (Node.js)     |     |
|                      |   :5432     |     |                  |     |
|                      +-------------+     +------------------+     |
|                                                 ^                 |
|                                                 |                 |
|                                          +------+------+          |
|                                          |   Inbox     |          |
|                                          | (Archivos)  |          |
|                                          +-------------+          |
+------------------------------------------------------------------+
```

### Contenedores

| Contenedor | Tecnología | Puerto | Responsabilidad |
|------------|------------|--------|-----------------|
| **Demo Portal** | Nginx + HTML/JS | 80 | UI para crear pedidos y ver trazabilidad |
| **Orders API** | Node.js + Express | 9000 | API REST, autenticación JWT, publicación de eventos |
| **RabbitMQ** | RabbitMQ 3 | 5672, 15672 | Broker de mensajería (P2P, Pub/Sub, DLQ) |
| **PostgreSQL** | PostgreSQL 16 | 5432 | Persistencia de pedidos y eventos |
| **Order Worker** | Node.js | - | Procesamiento asíncrono, validaciones, notificaciones |
| **Inbox** | Volumen Docker | - | Carpeta para archivos de sistemas legados |

---

## Flujos de Datos

### Flujo A: Creación de Pedido (Síncrono + Asíncrono)
1. Usuario crea pedido en Demo Portal
2. Portal envía POST /orders a Orders API (con JWT)
3. API valida idempotencia y persiste en PostgreSQL
4. API publica evento `OrderCreated` en RabbitMQ
5. Worker consume evento y procesa (inventario, pago)
6. Worker actualiza estado y publica `OrderConfirmed` o `OrderRejected`

### Flujo B: Notificaciones (Pub/Sub)
1. Worker publica eventos de cambio de estado
2. Cola de notificaciones consume eventos
3. Se simulan webhooks a Operaciones y notificaciones al cliente

### Flujo C: Integración Legada (Archivos)
1. Sistema externo deposita archivo JSON en /inbox
2. Worker detecta archivo nuevo (fs.watch)
3. Worker ingesta, valida y envía a cola principal
4. Archivo procesado se elimina

### Flujo D: Analítica (Batch)
1. Usuario solicita GET /analytics (con JWT)
2. API consulta agregaciones en PostgreSQL
3. Retorna métricas de ventas
