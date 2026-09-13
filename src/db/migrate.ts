/**
 * Migration runner. Applies every .sql file in /migrations in filename order
 * exactly once, inside a transaction, tracked in schema_migrations.
 *
 * Deliberately hand-rolled: no generator, no journal, no drift. `npm run migrate`
 * is safe to run on every deploy.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './client';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

export async function runMigrations(): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const done = new Set(
      (await client.query<{ name: string }>('select name from schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`applying ${file}... `);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
        process.stdout.write('ok\n');
      } catch (err) {
        await client.query('rollback');
        process.stdout.write('FAILED\n');
        throw err;
      }
    }
    if (applied.length === 0) console.log('database up to date');
    return applied;
  } finally {
    client.release();
  }
}
