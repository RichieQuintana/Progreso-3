const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json'); 
const cors = require('cors');

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
        await pool.query('SELECT 1');
        res.json({ 
            status: "UP", 
            database: "CONNECTED", 
            broker: channel ? "CONNECTED" : "DOWN" 
        });
    } catch (e) {
        res.status(500).json({ status: "DOWN", database: "DISCONNECTED" });
    }
});

app.post('/orders', authenticateJWT, async (req, res) => {
    const { id, customer_name, total_amount } = req.body;
    try {
        // Idempotencia (Requisito 4.1.6)
        const check = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (check.rows.length > 0) return res.status(409).json({ error: "Duplicate Order ID" });

        await pool.query(
            'INSERT INTO orders (id, customer_name, total_amount, status) VALUES ($1, $2, $3, $4)',
            [id, customer_name, total_amount, 'RECEIVED']
        );

        // Pub/Sub (Requisito 4.1.2)
        const message = { orderId: id, customer: customer_name, amount: total_amount, correlationId: id };
        channel.publish('order_events', '', Buffer.from(JSON.stringify(message)), { persistent: true });

        res.status(201).json({ message: "Order processed successfully", orderId: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/orders', async (req, res) => {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
});

app.get('/analytics', authenticateJWT, async (req, res) => {
    // Flujo D: Analítica Batch (Requisito 3.4)
    const stats = await pool.query('SELECT COUNT(*) as total, SUM(total_amount) as revenue FROM orders');
    res.json({
        report: "Sales Summary",
        data: stats.rows[0],
        timestamp: new Date()
    });
});

app.get('/login-demo', (req, res) => {
    const token = jwt.sign({ user: 'demo_user' }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
});

// Iniciar el ciclo de vida resiliente
startServer();