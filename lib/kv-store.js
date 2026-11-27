// One tiny key/value table in Postgres (Supabase) is all this app needs to keep accounts,
// sent-message attribution and reply assignments between requests.
// DATABASE_URL is the only setting; without it the app keeps state in memory, which is fine
// locally but not shared between serverless instances.
//
// Supabase's session pooler (port 5432) allows only about 15 clients per project, and every warm
// serverless instance keeps its own pool, so a burst of instances can take every slot. When that
// happens reads fail and the app reports an empty team - which looks like a password problem, not
// a database one. The transaction pooler on 6543 multiplexes many clients onto the same backends
// and is the mode Supabase documents for serverless, so a Supabase pooler URL is moved to it here.
// DB_POOL_MODE=session keeps the old port; anything else (a local database, a direct host, an
// explicit port) is left exactly as it was given.
const { Pool } = require('pg');

const TRANSACTION_PORT = '6543';
const SESSION_PORT = '5432';
const POOLER_HOST = /(^|\.)pooler\.supabase\.com$/i;

const connectionString = () => process.env.DATABASE_URL || '';
const configured = () => Boolean(connectionString());

const isSupabasePooler = (hostname) => POOLER_HOST.test(String(hostname || ''));

const connectionStringFor = (raw = connectionString()) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(session|direct)$/i.test(String(process.env.DB_POOL_MODE || '').trim())) return value;

  let url = null;
  try {
    url = new URL(value);
  } catch (err) {
    return value;
  }

  const port = url.port || SESSION_PORT;
  if (!isSupabasePooler(url.hostname) || port !== SESSION_PORT) return value;

  url.port = TRANSACTION_PORT;
  return url.toString();
};

// A serverless instance is short-lived and many run at once, so one connection each is enough
// once the transaction pooler multiplexes them. Local work keeps the old small pool.
const poolMaxFor = (env = process.env) => {
  const configuredMax = Number.parseInt(env.DB_POOL_MAX || '', 10);
  if (Number.isInteger(configuredMax) && configuredMax > 0) return configuredMax;
  return env.VERCEL ? 1 : 3;
};

let pool = null;
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionStringFor(),
      ssl: { rejectUnauthorized: false },
      max: poolMaxFor(),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000
    });
    // A dead idle connection must not crash the function
    pool.on('error', (err) => console.error('Database pool error:', err.message));
  }
  return pool;
};

// A pooler that is momentarily full refuses the connection or drops it, which the next attempt
// usually gets through. Only connection-level failures are retried: a statement that failed on its
// own merits is reported as it is, and a transaction that lost its connection rolled back.
const RETRY_CODES = new Set([
  '53300', // too_many_connections
  'EMAXCONNSESSION', // Supabase session pooler: max clients reached
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  '57P01', // admin_shutdown
  '08000',
  '08003',
  '08006'
]);
const RETRY_PAUSE_MS = [120, 400];

const retryable = (err) =>
  RETRY_CODES.has(String(err?.code || '')) ||
  /max clients reached|too many clients|timeout exceeded when trying to connect|connection terminated/i.test(
    String(err?.message || '')
  );

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (operation, label) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      if (attempt >= RETRY_PAUSE_MS.length || !retryable(err)) throw err;
      console.error(`${label} failed (${err.code || err.message}); retrying`);
      await pause(RETRY_PAUSE_MS[attempt]);
    }
  }
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
// Writers of the same key in this process take turns; the Postgres path uses a row lock, which
// also covers a second instance. Either way a read-modify-write cannot lose the other writer's row.
const memoryQueue = new Map();

const read = async (key, fallback) => {
  if (!configured()) return memory.has(key) ? memory.get(key) : fallback;

  return withRetry(async () => {
    await ensureTable();
    const { rows } = await getPool().query('select value from public.sales_kv where key = $1', [key]);
    return rows.length ? rows[0].value : fallback;
  }, 'Database read');
};

const write = async (key, value) => {
  if (!configured()) {
    memory.set(key, value);
    return;
  }

  await withRetry(async () => {
    await ensureTable();
    await getPool().query(
      `insert into public.sales_kv (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
  }, 'Database write');
};

// Read the value, let the caller change it, write it back - all while holding the row, so two
// concurrent appends to the same list do not each start from the same stale copy.
// A mutator that returns null has found nothing to change: the row is left alone, so a poll that
// had no work does not rewrite a large list.
const update = async (key, fallback, mutator) => {
  if (!configured()) {
    const run = async () => {
      const current = memory.has(key) ? memory.get(key) : fallback;
      const next = await mutator(current, {
        read: async (otherKey, otherFallback = null) =>
          memory.has(otherKey) ? memory.get(otherKey) : otherFallback
      });
      if (next === null || next === undefined) return current;
      memory.set(key, next);
      return next;
    };
    const queued = (memoryQueue.get(key) || Promise.resolve()).then(run, run);
    // The queue only orders the turns; a rejection belongs to the caller, not to the next writer
    memoryQueue.set(key, queued.catch(() => {}));
    return queued;
  }

  return withRetry(async () => {
    await ensureTable();
    const client = await getPool().connect();
    try {
      await client.query('begin');
      // Create the row first, so there is something to lock even on the very first write
      await client.query(
        `insert into public.sales_kv (key, value, updated_at) values ($1, $2::jsonb, now())
         on conflict (key) do nothing`,
        [key, JSON.stringify(fallback ?? null)]
      );
      const { rows } = await client.query('select value from public.sales_kv where key = $1 for update', [key]);
      const current = rows.length ? rows[0].value : fallback;
      // A mutator that needs another key reads it on this same connection: an instance holds one
      // client, so asking the pool for a second one while the transaction has it would wait for
      // the transaction to finish, which is the mutator itself.
      const next = await mutator(current, {
        read: async (otherKey, otherFallback = null) => {
          const other = await client.query('select value from public.sales_kv where key = $1', [otherKey]);
          return other.rows.length ? other.rows[0].value : otherFallback;
        }
      });
      if (next !== null && next !== undefined) {
        await client.query('update public.sales_kv set value = $2::jsonb, updated_at = now() where key = $1', [
          key,
          JSON.stringify(next)
        ]);
      }
      await client.query('commit');
      return next === null || next === undefined ? current : next;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }, 'Database update');
};

module.exports = { configured, read, write, update, connectionStringFor, poolMaxFor };
