\c orders_db;
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Requisito 3.4 y 5.4: Tabla para trazabilidad y eventos analíticos
CREATE TABLE IF NOT EXISTS order_events (
    event_id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    event_type VARCHAR(50), -- OrderCreated, OrderConfirmed, etc.
    payload JSONB,
    occured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Requisito 5.5: Datos iniciales para asegurar que el sistema está "vivo"
INSERT INTO orders (id, customer_name, total_amount, status) 
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Cliente Demo', 150.00, 'PENDING')
ON CONFLICT (id) DO NOTHING;