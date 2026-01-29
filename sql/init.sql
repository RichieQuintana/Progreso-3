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

-- Outbox pattern: asegurar atomicidad DB -> evento
CREATE TABLE IF NOT EXISTS outbox (
    id SERIAL PRIMARY KEY,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN DEFAULT FALSE,
    tries INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

-- Inventario / catálogo para flujo C (ingesta CSV)
CREATE TABLE IF NOT EXISTS inventory (
    sku VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255),
    quantity INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registro de ingestas de archivos
CREATE TABLE IF NOT EXISTS file_ingestion_logs (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255),
    status VARCHAR(50), -- processed, invalid, error
    details TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Requisito 5.5: Datos iniciales para asegurar que el sistema está "vivo"
INSERT INTO orders (id, customer_name, total_amount, status) 
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Cliente Demo', 150.00, 'PENDING')
ON CONFLICT (id) DO NOTHING;