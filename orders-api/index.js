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
        channel = await conn.createConfirmChannel(); // confirm channel para asegurar publishes
        await channel.assertExchange('order_events', 'fanout', { durable: true });
        console.log(" [*] Broker RabbitMQ: CONECTADO (ConfirmChannel)");
        // Intentar enviar eventos pendientes cuando la conexión esté lista
        await flushPendingEvents();
    } catch (err) {
        console.error(" [!] RabbitMQ no listo, reintentando en 5s...");
        setTimeout(connectRabbit, 5000);
    }
}

let pendingEvents = [];

async function publishWithRetry(exchange, routingKey, payload, options = {}, attempts = 5, delay = 2000) {
    // Intentar publicar, reintentando conexión si es necesario
    if (!channel) {
        for (let i = 0; i < attempts; i++) {
            console.warn(`[!] Rabbit channel no disponible, reintento ${i+1}/${attempts}`);
            await new Promise(r => setTimeout(r, delay));
            if (channel) break;
            await connectRabbit();
        }
    }
    if (channel) {
        try {
            channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), options);
            // Esperar confirmación del broker (ConfirmChannel)
            if (channel.waitForConfirms) {
                await channel.waitForConfirms();
            }
            return true;
        } catch (e) {
            console.error('[!] Error publicando evento:', e.message);
        }
    }
    // Si falla, encolar para intentarlo luego
    pendingEvents.push({ exchange, routingKey, payload, options });
    return false;
}

async function flushPendingEvents() {
    if (!channel || pendingEvents.length === 0) return;
    const items = pendingEvents.splice(0);
    for (const ev of items) {
        try {
            channel.publish(ev.exchange, ev.routingKey, Buffer.from(JSON.stringify(ev.payload)), ev.options);
            console.log('[*] Evento pendiente enviado:', ev.payload.eventType || ev.payload.id || ev.payload.orderId);
        } catch (e) {
            console.error('[!] Falló flush, reencolando:', e.message);
            pendingEvents.unshift(ev);
            break;
        }
    }
}

setInterval(flushPendingEvents, 5000);

// Outbox flusher: publica eventos desde la tabla outbox y marca como publicados
async function flushOutboxBatch(limit = 10) {
    if (!channel) return; // si no hay broker, no intentamos
    try {
        const res = await pool.query('SELECT id, aggregate_type, aggregate_id, event_type, payload, tries FROM outbox WHERE published = FALSE ORDER BY created_at ASC LIMIT $1', [limit]);
        for (const row of res.rows) {
            try {
                const payload = row.payload; // JSON object
                channel.publish('order_events', '', Buffer.from(JSON.stringify(payload)), { persistent: true });
                if (channel.waitForConfirms) await channel.waitForConfirms();
                await pool.query('UPDATE outbox SET published = TRUE, published_at = NOW() WHERE id = $1', [row.id]);
                console.log('[Outbox] Evento publicado y marcado:', row.event_type, row.aggregate_id);
            } catch (e) {
                console.error('[Outbox] Error publicando evento id=' + row.id + ':', e.message);
                await pool.query('UPDATE outbox SET tries = tries + 1, last_error = $1 WHERE id = $2', [e.message, row.id]);
            }
        }
    } catch (err) {
        console.error('[Outbox] Error al leer outbox:', err.message);
    }
}

setInterval(() => flushOutboxBatch(10), 3000);

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

// Middleware de Seguridad JWT (Requisito 4.3) - mantiene demo
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

// Middleware para OAuth2 client_credentials (verifica scope)
const authenticateScope = (requiredScope) => (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.sendStatus(401);
    const token = authHeader.split(' ')[1];
    const secret = process.env.AUTH_SECRET || SECRET_KEY || 'auth_shared_secret';
    jwt.verify(token, secret, (err, payload) => {
        if (err) return res.sendStatus(403);
        const scopes = (payload.scope || '').split(/\s+/);
        if (requiredScope && !scopes.includes(requiredScope)) return res.status(403).json({ error: 'insufficient_scope' });
        req.user = payload;
        next();
    });
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

app.post('/orders', authenticateScope('orders:write'), async (req, res) => {
    const { id, customer_name, total_amount } = req.body;
    try {
        // Idempotencia (Requisito 4.1.6) - Usando Circuit Breaker
        const check = await dbBreaker.fire('SELECT * FROM orders WHERE id = $1', [id]);
        if (check.fallback) {
            return res.status(503).json({ error: "Database temporarily unavailable", circuitBreaker: "OPEN" });
        }
        if (check.rows.length > 0) return res.status(409).json({ error: "Duplicate Order ID" });

        // Usar Outbox Pattern: insertar ORDER y OUTBOX en la misma transacción
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

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('INSERT INTO orders (id, customer_name, total_amount, status) VALUES ($1, $2, $3, $4)',
                [id, customer_name, total_amount, 'RECEIVED']);
            await client.query('INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload) VALUES ($1,$2,$3,$4)',
                ['order', id, 'OrderCreated', message]);
            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            client.release();
            throw txErr;
        }
        client.release();

        res.status(201).json({ message: "Order processed successfully", orderId: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/orders', async (req, res) => {
    try {
        const result = await dbBreaker.fire('SELECT * FROM orders ORDER BY created_at DESC', []);
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
    // Token demo incluye scopes para facilitar pruebas: orders:write y orders:read
    const token = jwt.sign({ user: 'demo_user', scope: 'orders:write orders:read' }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
});

// Iniciar el ciclo de vida resiliente
startServer();