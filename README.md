IntegraHub - Ecosistema de Gestión de Pedidos (Progreso 3)

Este proyecto implementa un sistema robusto de integración de microservicios utilizando una arquitectura dirigida por eventos, cumpliendo con los estándares de resiliencia, 
seguridad JWT, idempotencia y gobierno de APIs.

🛠️ Requisitos Previos

Docker y Docker Compose instalados.

No se requiere instalación local de Node.js o bases de datos, ya que todo el entorno está contenedorizado.

🚀 Despliegue con un Solo Comando (Requisito 5.2)

Para levantar todo el ecosistema (Base de Datos, Broker, API, Worker y Portal), ejecuta en la raíz del proyecto:

Bash

docker compose up -d --build

🔗 Accesos Directos (Requisito 5.3 y 5.4)

Demo Portal (Frontend): http://localhost

Swagger UI (Documentación): http://localhost:9000/api-docs

RabbitMQ Management: http://localhost:15672 (User: admin / Pass: admin_pass)

Health Check API: http://localhost:9000/health

Panel de Control: Demo Portal

<img width="1795" height="999" alt="image" src="https://github.com/user-attachments/assets/e226c3be-b8ab-42ae-b685-26c2fa98e68c" />

Gobierno de API: Swagger UI

<img width="1191" height="989" alt="image" src="https://github.com/user-attachments/assets/1edeb1a7-4488-4002-bdad-03cfa9a6a936" />

<img width="1775" height="850" alt="image" src="https://github.com/user-attachments/assets/bcd1acd5-50a5-4df0-bada-a6e70ebee85d" />

<img width="1788" height="529" alt="image" src="https://github.com/user-attachments/assets/3973b234-ddf3-4d30-97f3-9c35c0ad2991" />

Mensajería: RabbitMQ Management

<img width="1836" height="603" alt="image" src="https://github.com/user-attachments/assets/12879ef9-d98a-4aca-99e7-e9ab5a6624b3" />

<img width="1493" height="616" alt="image" src="https://github.com/user-attachments/assets/2925d6e9-95c9-48e4-87e6-99555de85090" />

Observabilidad: Health Check & Logs

<img width="367" height="221" alt="image" src="https://github.com/user-attachments/assets/2a53590c-250c-4971-bb19-b4841657cbc4" />

<img width="1099" height="215" alt="image" src="https://github.com/user-attachments/assets/28d6e7c3-6edc-48f8-89a4-bb0043b545c4" />

<img width="1471" height="166" alt="image" src="https://github.com/user-attachments/assets/236f717d-edce-480c-a222-fd41fc687275" />

<img width="1460" height="692" alt="image" src="https://github.com/user-attachments/assets/a34a2433-1987-4bcb-82a2-d6e4439142e3" />

<img width="1312" height="270" alt="image" src="https://github.com/user-attachments/assets/bcf2f70a-fb8a-45fa-964b-a60fc0ddad06" />

<img width="1469" height="650" alt="image" src="https://github.com/user-attachments/assets/53a14867-0d06-4a6d-b983-9e0af36fc628" />

Integración Legada: Flujo C (Inbox)

<img width="506" height="285" alt="image" src="https://github.com/user-attachments/assets/cdbf10c2-ac43-4897-b413-368d91420711" />







