/* ================================================================
   db/index.js — PostgreSQL connection pool + schema init
================================================================ */
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Render managed DB
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

/** Run a single query. Throws on error. */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB] ${(Date.now() - start)}ms — ${text.slice(0, 80)}`);
    }
    return res;
  } catch (err) {
    console.error('[DB Error]', err.message, '\nQuery:', text.slice(0, 200));
    throw err;
  }
}

/** Run schema.sql to create tables if they don't exist. */
async function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('[DB] Schema initialised.');
}

module.exports = { query, pool, initSchema };
