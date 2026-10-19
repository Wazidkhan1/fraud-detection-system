import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

export async function createDatabase({ databaseUrl = '', forceDemo = false } = {}) {
  let db;
  if (databaseUrl && !forceDemo) {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000 });
    pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
    db = {
      mode: 'postgresql',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
      transaction: async (action) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await action(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      },
    };
  } else {
    const embedded = new PGlite();
    db = {
      mode: 'demo',
      query: (sql, params) => embedded.query(sql, params),
      exec: (sql) => embedded.exec(sql),
      close: () => embedded.close(),
      transaction: (action) => embedded.transaction(action),
    };
  }
  try {
    await db.exec(await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8'));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
