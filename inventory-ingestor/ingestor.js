const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { Pool } = require('pg');

const INBOX = process.env.INBOX_DIR || '/app/inbox';
const PROCESSED = path.join(INBOX, 'processed');
const ERRORS = path.join(INBOX, 'errors');

if (!fs.existsSync(PROCESSED)) fs.mkdirSync(PROCESSED, { recursive: true });
if (!fs.existsSync(ERRORS)) fs.mkdirSync(ERRORS, { recursive: true });

const pool = new Pool({
  user: process.env.DB_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_NAME || 'orders_db',
  password: process.env.DB_PASSWORD || 'secret_password',
  port: 5432,
});

async function logFile(filename, status, details='') {
  try {
    await pool.query('INSERT INTO file_ingestion_logs (filename, status, details) VALUES ($1,$2,$3)', [filename, status, details]);
  } catch (err) {
    console.error('Error log file ingestion:', err.message);
  }
}

function validateRow(row) {
  // Esperamos columnas: sku,name,quantity
  return row.sku && row.name && row.quantity !== undefined && !isNaN(Number(row.quantity));
}

async function processFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`[Ingestor] Procesando archivo: ${filename}`);
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for await (const record of parser) {
      const row = Object.keys(record).reduce((acc,k) => (acc[k.trim()]=record[k].trim(),acc), {});
      if (!validateRow(row)) {
        throw new Error('Invalid row format: ' + JSON.stringify(record));
      }
      const sku = row.sku;
      const name = row.name;
      const qty = parseInt(row.quantity, 10);
      await client.query(
        `INSERT INTO inventory (sku, name, quantity, updated_at) VALUES ($1,$2,$3,NOW())
         ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, quantity = EXCLUDED.quantity, updated_at = NOW()`,
        [sku, name, qty]
      );
    }
    await client.query('COMMIT');
    await logFile(filename, 'processed');
    const dest = path.join(PROCESSED, filename);
    fs.renameSync(filePath, dest);
    console.log(`[Ingestor] Archivo procesado y movido a processed: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Ingestor] Error procesando ${filename}:`, err.message);
    await logFile(filename, 'invalid', err.message);
    const dest = path.join(ERRORS, filename);
    fs.renameSync(filePath, dest);
  } finally {
    client.release();
  }
}

function scanInbox() {
  const files = fs.readdirSync(INBOX).filter(f => f.endsWith('.csv'));
  for (const f of files) {
    const full = path.join(INBOX, f);
    processFile(full);
  }
}

console.log('[Ingestor] Observando folder:', INBOX);
setInterval(scanInbox, 5000);
scanInbox();
