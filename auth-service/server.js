const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const CLIENTS = { 'integra-client': 'secret123', 'read-only-client': 'secret-read' };
const AUTH_SECRET = process.env.AUTH_SECRET || 'auth_shared_secret';

app.post('/token', (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body;
  if (grant_type !== 'client_credentials') return res.status(400).json({ error: 'unsupported_grant_type' });
  if (!CLIENTS[client_id] || CLIENTS[client_id] !== client_secret) return res.status(401).json({ error: 'invalid_client' });
  const grantedScope = scope || 'orders:read orders:write';
  const token = jwt.sign({ sub: client_id, scope: grantedScope }, AUTH_SECRET, { expiresIn: '1h' });
  res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
});

app.get('/.well-known/jwks.json', (req, res) => {
  // Placeholder: in production use JWKS and asymmetric keys. For demo, we just acknowledge.
  res.json({ message: 'No JWKS. Using shared secret for HMAC demo.' });
});

app.listen(4000, () => console.log('Auth service started on :4000'));
