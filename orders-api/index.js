const express = require('express');
const amqp = require('amqplib');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'mi_clave_secreta';

const pool = new Pool({
  host: 'db',
  user: 'user_admin',
  password: 'secret_password',
  database: 'orders_db'
});

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err) => {
      if (err) return res.sendStatus(403);
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'UP', database: 'Connected', broker: 'RabbitMQ Active' });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', error: err.message });
  }
});

app.post('/orders', authenticateJWT, async (req, res) => {
  const { id, customer_name, total_amount } = req.body;
  
  try {
    // 1. Persistencia en Postgres
    await pool.query('INSERT INTO orders (id, customer_name, total_amount) VALUES ($1, $2, $3)', 
      [id, customer_name, total_amount]);

    // 2. Conexión a RabbitMQ con Manejo de Errores
    const conn = await amqp.connect(`amqp://admin:admin_pass@${process.env.RABBIT_HOST}`);
    const channel = await conn.createChannel();
    
    // IMPORTANTE: Estos argumentos deben ser IGUALES a los del Worker
    const queueArgs = {
      'x-dead-letter-exchange': 'order_dlx',
      'x-dead-letter-routing-key': 'failed'
    };

    await channel.assertQueue('order_created', { 
      durable: true, 
      arguments: queueArgs 
    });

    channel.sendToQueue('order_created', Buffer.from(JSON.stringify(req.body)), { persistent: true });
    
    // Cerrar canal suavemente
    setTimeout(() => conn.close(), 500);

    res.status(201).json({ message: 'Pedido creado exitosamente', orderId: id });
  } catch (err) {
    console.error("Error en el flujo:", err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: "ID de pedido duplicado" });
    }
    res.status(500).json({ error: "Error interno del servidor", details: err.message });
  }
});

app.listen(8080, () => console.log('API Activa en puerto 8080'));