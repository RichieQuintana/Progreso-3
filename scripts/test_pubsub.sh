#!/bin/bash
# Script de prueba: obtiene token y crea un pedido
set -e

echo "Obteniendo token demo..."
TOKEN=$(curl -s http://localhost:9000/login-demo | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then
  echo "No se pudo obtener token. Asegúrate que orders-api esté arriba"
  exit 1
fi

echo "Token: $TOKEN"

echo "Creando pedido de prueba..."
curl -s -X POST http://localhost:9000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"id":"test-`date +%s`","customer_name":"Prueba","total_amount":42}'

echo "\nListo. Revisa logs del worker y notification-service para ver las notificaciones."
