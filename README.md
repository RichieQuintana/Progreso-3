*Este proyecto implementa una arquitectura de microservicios robusta para la gestión de pedidos, diseñada bajo los principios de Enterprise Integration Patterns (EIP). 
El sistema integra flujos síncronos y asíncronos, garantizando la resiliencia y la interoperabilidad con sistemas legados.*

🚀 Características Técnicas
API RESTful: Desarrollada en Node.js con seguridad JWT y validación de Idempotencia.

Mensajería Asíncrona: Implementación de RabbitMQ para desacoplamiento de servicios.

Resiliencia: Patrón Dead Letter Channel para el manejo de excepciones de negocio.

Persistencia Inmutable: Base de datos PostgreSQL para el registro de transacciones.

Integración Legada: Monitoreo de sistema de archivos (File Transfer) para ingesta de datos JSON.

🛠️ Requisitos
Docker y Docker Compose.

Postman (para pruebas de API).

📥 Instalación y Despliegue
Clonar el repositorio.

Levantar los servicios:

Bash

docker compose up -d --build
Verificar Salud del Sistema: Accede a http://localhost:9000/health para confirmar que la DB y el Broker están activos.

🧪 Guía de Pruebas (Validación de Consigna)
1. Flujo A: Compra vía API (Síncrono/Asíncrono)
Acción: Enviar un POST a http://localhost:9000/orders con un token JWT válido.

Resultado: El pedido se guarda en Postgres y se publica en la cola order_created de RabbitMQ.

Prueba de Idempotencia: Si intentas enviar el mismo ID, recibirás un error 409 Conflict.

2. Flujo C: Ingesta de Archivos (Legado)
Acción: Colocar un archivo .json en la carpeta order-worker/inbox.

Resultado: El Worker detecta el archivo, lo inyecta en el bus de mensajería y lo procesa automáticamente.

3. Resiliencia: Dead Letter Queue (DLQ)
Acción: Enviar un pedido con total_amount: -50.

Resultado: El Worker rechaza el mensaje por lógica de negocio y RabbitMQ lo desvía a la cola order_dead_letter_queue.
