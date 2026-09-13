/** CLI entry: `npm run migrate`. Safe to run on every deploy. */
import { pool } from '@/db/client';
import { runMigrations } from '@/db/migrate';

runMigrations()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
