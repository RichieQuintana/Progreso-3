# Diagrama de Secuencia: Create Order (E2E)

## Flujo Exitoso (Happy Path)

<img width="993" height="942" alt="image" src="https://github.com/user-attachments/assets/c130692f-bef6-487e-b818-4711e80b750b" />

## Notas del Flujo

1. **Autenticación**: El Demo Portal primero obtiene un token JWT
2. **Idempotencia**: La API verifica que el Order ID no exista antes de crear
3. **Pub/Sub**: El evento se publica en un exchange fanout
4. **Procesamiento Asíncrono**: El Worker procesa inventario y pago
5. **Trazabilidad**: Cada paso se registra en la tabla `order_events`
6. **Notificaciones**: Se envían webhooks simulados tras confirmar/rechazar
