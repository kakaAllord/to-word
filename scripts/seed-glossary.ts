/**
 * Seed the global glossary with the acronym fixes from the spec. The migration
 * already does this; this script exists for a database seeded some other way.
 */
import { isNull } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { glossaryTerm } from '@/db/schema';

const SEED = [
  { wrong: 'MIVAF', right: 'MIVARF' },
  { wrong: 'AMPOS', right: 'AMCOS' },
  { wrong: 'Amcos', right: 'AMCOS' },
];

async function main() {
  const existing = await db
    .select({ wrong: glossaryTerm.wrong })
    .from(glossaryTerm)
    .where(isNull(glossaryTerm.taskId));
  const have = new Set(existing.map((row) => row.wrong.toLowerCase()));
  const missing = SEED.filter((term) => !have.has(term.wrong.toLowerCase()));
  if (missing.length === 0) {
    console.log('global glossary already seeded');
  } else {
    await db.insert(glossaryTerm).values(missing.map((term) => ({ ...term, taskId: null })));
    console.log(`inserted ${missing.length} global term(s)`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
