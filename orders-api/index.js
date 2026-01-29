const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const cors = require('cors');
const CircuitBreaker = require('opossum');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 9000;
const SECRET_KEY = process.env.JWT_SECRET || "mi_clave_secreta";

// Configuración de Base de Datos
const pool = new Pool({
    user: process.env.DB_USER || 'user_admin',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'orders_db',
    password: process.env.DB_PASSWORD || 'secret_password',
    port: 5432,
});

let channel;

// --- CIRCUIT BREAKER (Requisito 4.2) ---
const circuitOptions = {
    timeout: 5000,              // Timeout de 5 segundos
    errorThresholdPercentage: 50, // Abre si 50% de requests fallan
    resetTimeout: 10000         // Intenta cerrar después de 10s
};

// Función envuelta para queries de BD
async function dbQuery(query, params) {
    return pool.query(query, params);
}

// Circuit Breaker para Base de Datos
const dbBreaker = new CircuitBreaker(dbQuery, circuitOptions);

dbBreaker.on('open', () => console.log('⚡ [Circuit Breaker] ABIERTO - BD no disponible'));
dbBreaker.on('halfOpen', () => console.log('🔄 [Circuit Breaker] SEMI-ABIERTO - Probando BD...'));
dbBreaker.on('close', () => console.log('✅ [Circuit Breaker] CERRADO - BD operativa'));
dbBreaker.fallback(() => ({ rows: [], fallback: true }));

// --- FUNCIONES DE RESILIENCIA (Requisito 4.2) ---

async function connectRabbit() {
    try {
        const conn = await amqp.connect(`amqp://admin:admin_pass@${process.env.RABBIT_HOST || 'rabbitmq'}`);
        channel = await conn.createChannel();
        await channel.assertExchange('order_events', 'fanout', { durable: true });
        console.log(" [*] Broker RabbitMQ: CONECTADO");
    } catch (err) {
        console.error(" [!] RabbitMQ no listo, reintentando en 5s...");
        setTimeout(connectRabbit, 5000);
    }
}

async function startServer() {
    try {
        // Intentar una consulta simple para verificar la DB
        await pool.query('SELECT 1');
        console.log(" [*] Base de Datos: CONECTADA");
        
        await connectRabbit();

        app.listen(PORT, () => {
            console.log(`🚀 IntegraHub API: http://localhost:${PORT}`);
            console.log(`📄 Swagger UI: http://localhost:${PORT}/api-docs`);
        });
    } catch (err) {
        console.error(" [!] Base de datos no lista, reintentando arranque...");
        setTimeout(startServer, 5000);
    }
}

// Middleware de Seguridad JWT (Requisito 4.3)
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// --- ENDPOINTS ---

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', async (req, res) => {
    try {
        const dbResult = await dbBreaker.fire('SELECT 1', []);
        const dbStatus = dbResult.fallback ? "CIRCUIT_OPEN" : "CONNECTED";
        res.json({
            status: dbResult.fallback ? "DEGRADED" : "UP",
            database: dbStatus,
            broker: channel ? "CONNECTED" : "DOWN",
            circuitBreaker: dbBreaker.opened ? 'OPEN' : (dbBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED')
        });
    } catch (e) {
        res.status(500).json({ status: "DOWN", database: "DISCONNECTED", error: e.message });
    }
});

app.post('/orders', authenticateJWT, async (req, res) => {
    const { id, customer_name, total_amount } = req.body;
    try {
        // Idempotencia (Requisito 4.1.6) - Usando Circuit Breaker
        const check = await dbBreaker.fire('SELECT * FROM orders WHERE id = $1', [id]);
        if (check.fallback) {
            return res.status(503).json({ error: "Database temporarily unavailable", circuitBreaker: "OPEN" });
        }
        if (check.rows.length > 0) return res.status(409).json({ error: "Duplicate Order ID" });

        await dbBreaker.fire(
            'INSERT INTO orders (id, customer_name, total_amount, status) VALUES ($1, $2, $3, $4)',
            [id, customer_name, total_amount, 'RECEIVED']
        );

        // Pub/Sub (Requisito 4.1.2)
        const message = {
            id: id,
            orderId: id,
            customer_name: customer_name,
            customer: customer_name,
            total_amount: total_amount,
            amount: total_amount,
            correlationId: id,
            eventType: 'OrderCreated',
            timestamp: new Date().toISOString()
        };
        channel.publish('order_events', '', Buffer.from(JSON.stringify(message)), { persistent: true });

        res.status(201).json({ message: "Order processed successfully", orderId: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/orders', async (req, res) => {
    try {
        // Query con último evento para trazabilidad (Requisito 5.4)
        const query = `
            SELECT o.*,
                   e.event_type as last_event,
                   e.occured_at as last_event_time
            FROM orders o
            LEFT JOIN LATERAL (
                SELECT event_type, occured_at
                FROM order_events
                WHERE order_id = o.id
                ORDER BY occured_at DESC
                LIMIT 1
            ) e ON true
            ORDER BY o.created_at DESC
        `;
        const result = await dbBreaker.fire(query, []);
        if (result.fallback) {
            return res.status(503).json({ error: "Database temporarily unavailable", circuitBreaker: "OPEN" });
        }
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/analytics', authenticateJWT, async (req, res) => {
    try {
        // Flujo D: Analítica Batch (Requisito 3.4)
        const stats = await dbBreaker.fire('SELECT COUNT(*) as total, SUM(total_amount) as revenue FROM orders', []);
        if (stats.fallback) {
            return res.status(503).json({ error: "Database temporarily unavailable", circuitBreaker: "OPEN" });
        }
        res.json({
            report: "Sales Summary",
            data: stats.rows[0],
            timestamp: new Date()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para ver estado del Circuit Breaker
app.get('/circuit-status', (req, res) => {
    res.json({
        database: {
            state: dbBreaker.opened ? 'OPEN' : (dbBreaker.halfOpen ? 'HALF-OPEN' : 'CLOSED'),
            stats: dbBreaker.stats
        }
    });
});

app.get('/login-demo', (req, res) => {
    const token = jwt.sign({ user: 'demo_user' }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
});

// Endpoint para simular Flujo C (Sistema Legado via Archivo)
app.post('/simulate-legacy-file', (req, res) => {
    const fs = require('fs');
    const path = require('path');

    const legacyOrder = {
        id: require('crypto').randomUUID(),
        customer_name: "Sistema Legado ERP",
        total_amount: Math.floor(Math.random() * 200) + 50,
        source: "legacy_file",
        timestamp: new Date().toISOString()
    };

    // Simular que un sistema externo deposita archivo en inbox
    const inboxPath = '/app/inbox'; // Path dentro del contenedor worker
    const filename = `legacy_order_${Date.now()}.json`;

    // Publicar directamente al exchange (simula el resultado del Flujo C)
    const message = {
        ...legacyOrder,
        orderId: legacyOrder.id,
        customer: legacyOrder.customer_name,
        amount: legacyOrder.total_amount,
        eventType: 'OrderCreated'
    };

    try {
        channel.publish('order_events', '', Buffer.from(JSON.stringify(message)), { persistent: true });
        res.json({
            message: "Archivo de sistema legado simulado",
            filename: filename,
            order: legacyOrder
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Iniciar el ciclo de vida resiliente
startServer();