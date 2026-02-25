import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT name FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        process.stdout.write(`Applied: ${file}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    process.stdout.write('All migrations applied.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  process.stderr.write(
    `Migration failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
