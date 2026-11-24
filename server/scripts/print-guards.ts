/*
  Append the database-rule SQL to a migration file, so a fresh database gets
  the same rules the running server re-creates at startup:

    npx ts-node scripts/print-guards.ts prisma/migrations/<name>/migration.sql
*/
import { appendFileSync } from 'fs';
import { guardsAsMigrationSql } from '../src/reference-data/guards';

const target = process.argv[2];
if (!target) {
  console.error('Usage: ts-node scripts/print-guards.ts <migration.sql>');
  process.exit(1);
}
appendFileSync(target, `\n-- Database rules for reference data (see src/reference-data/guards.ts)\n${guardsAsMigrationSql()}\n`, 'utf-8');
console.log(`Appended database rules to ${target}`);
