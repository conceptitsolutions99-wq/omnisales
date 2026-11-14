// One tiny key/value table in Postgres (Supabase) is all this app needs to keep accounts,
// sent-message attribution and reply assignments between requests.
// DATABASE_URL is the only setting; without it the app keeps state in memory, which is fine
// locally but not shared between serverless instances.
const { Pool } = require('pg');

const connectionString = () => process.env.DATABASE_URL || '';
const configured = () => Boolean(connectionString());

let pool = null;
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000
    });
    // A dead idle connection must not crash the function
    pool.on('error', (err) => console.error('Database pool error:', err.message));
  }
  return pool;
};

// The table is created by migration, not at runtime: the app's role may only read and write
// rows, so this is a single read-only readiness check per instance.
let tableReady = null;
const ensureTable = () => {
  if (!tableReady) {
    tableReady = getPool()
      .query('select 1 from public.sales_kv limit 1')
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
};

const memory = new Map();

const read = async (key, fallback) => {
  if (!configured()) return memory.has(key) ? memory.get(key) : fallback;

  await ensureTable();
  const { rows } = await getPool().query('select value from public.sales_kv where key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
};

const write = async (key, value) => {
  if (!configured()) {
    memory.set(key, value);
    return;
  }

  await ensureTable();
  await getPool().query(
    `insert into public.sales_kv (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
};

module.exports = { configured, read, write };
