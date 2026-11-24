/**
 * Audit triggers: the database writes the history itself.
 *
 * For every table (except the few listed below) three SQLite triggers record
 * what happened in `audit_log`:
 *   - a create: one row holding all the new values,
 *   - an update: one row per field that actually changed (old value, new value),
 *   - a delete: one row holding all the values the record had.
 *
 * Because they are triggers, nothing can change data without leaving a trace:
 * not the API, not an import, not a script, and not a side effect such as a
 * task losing its person when that person is deleted. The history row and the
 * change are saved together or not at all.
 *
 * The triggers are built from the tables and columns that exist when the server
 * starts, so a new table or field is covered with no further work.
 *
 * Who made the change comes from the one-row `audit_actor` table, which the
 * server fills in for the length of each write request (see audit.service.ts).
 * A change made with no actor set (a script, the scheduled backup) is recorded
 * with no name and shown as "System".
 */

export interface TableColumn {
  name: string;
  type: string;
  /** Position in the primary key, 0 if not part of it. */
  pk: number;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
}

export interface AuditStatement {
  name: string;
  sql: string;
}

/** Tables that are not audited, and why. */
export const UNAUDITED_TABLES = [
  '_prisma_migrations', // Prisma's own bookkeeping
  'audit_log', // the history itself
  'audit_actor', // who is acting right now
  'deal_stage_changes', // already a history of its own (and its "used" flag would only add noise)
];

/** Columns never recorded: they change on every save, or are secret. */
const NOISY_COLUMNS = new Set(['updatedAt', 'updated_at']);
const SECRET_COLUMN = /password|secret|token/i;

export const TRIGGER_PREFIX = 'crm_aud_';

/**
 * A junction table is recorded against the record that owns it, as a change to
 * one field, so "Industries" on a company reads like any other field.
 */
export const LINK_TABLES: Record<string, { entity: string; ownerColumn: string; field: string; targetTable: string; targetColumn: string }> = {
  company_industries: {
    entity: 'companies',
    ownerColumn: 'company_id',
    field: 'industry',
    targetTable: 'industries',
    targetColumn: 'industry_id',
  },
};

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
/** The actor, unless the stamp is stale (a crashed request must not name someone for ever). */
const ACTOR_FRESH = `id = 1 AND set_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-120 seconds')`;
const ACTOR_ID = `(SELECT actor_id FROM audit_actor WHERE ${ACTOR_FRESH})`;
const ACTOR_NAME = `(SELECT actor_name FROM audit_actor WHERE ${ACTOR_FRESH})`;

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const lit = (text: string) => `'${text.replace(/'/g, "''")}'`;

export function isAuditedColumn(name: string): boolean {
  return !NOISY_COLUMNS.has(name) && !SECRET_COLUMN.test(name);
}

/** A column's value as readable text: dates as ISO text (Prisma stores them as milliseconds), booleans as true/false. */
function valueOf(row: 'OLD' | 'NEW', col: TableColumn): string {
  const ref = `${row}.${q(col.name)}`;
  const type = col.type.toUpperCase();
  if (type === 'DATETIME') {
    return `CASE typeof(${ref}) WHEN 'integer' THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${ref} / 1000.0, 'unixepoch') ELSE ${ref} END`;
  }
  if (type === 'BOOLEAN') return `CASE ${ref} WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE ${ref} END`;
  // 1000.0 reads better as 1000
  if (type === 'REAL' || type === 'FLOAT' || type === 'DOUBLE') {
    return `CASE WHEN typeof(${ref}) = 'real' AND ${ref} = CAST(${ref} AS INTEGER) THEN CAST(CAST(${ref} AS INTEGER) AS TEXT) ELSE ${ref} END`;
  }
  return ref;
}

function recordIdOf(row: 'OLD' | 'NEW', table: TableInfo): string {
  const key = table.columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
  const cols = key.length ? key : table.columns.filter((c) => c.name === 'id');
  if (!cols.length) return 'NULL';
  return cols.map((c) => `${row}.${q(c.name)}`).join(` || ':' || `);
}

const snapshot = (row: 'OLD' | 'NEW', cols: TableColumn[]) =>
  `json_object(${cols.map((c) => `${lit(c.name)}, ${valueOf(row, c)}`).join(', ')})`;

const insertRow = (action: string, entity: string, recordId: string, field: string, oldValue: string, newValue: string, where = '') =>
  `INSERT INTO audit_log (at, actor_id, actor_name, action, entity, record_id, field, old_value, new_value) ` +
  `SELECT ${NOW}, ${ACTOR_ID}, ${ACTOR_NAME}, ${lit(action)}, ${lit(entity)}, ${recordId}, ${field}, ${oldValue}, ${newValue}${where};`;

/** The three triggers for one table. */
export function auditStatementsFor(table: TableInfo): AuditStatement[] {
  const cols = table.columns.filter((c) => isAuditedColumn(c.name));
  if (!table.columns.length) return [];
  const t = table.name;
  const make = (suffix: string, event: string, body: string): AuditStatement => ({
    name: `${TRIGGER_PREFIX}${t}_${suffix}`,
    sql: `CREATE TRIGGER ${TRIGGER_PREFIX}${t}_${suffix} AFTER ${event} ON ${q(t)}\nBEGIN\n${body}\nEND`,
  });

  const link = LINK_TABLES[t];
  if (link) {
    const owner = (row: 'OLD' | 'NEW') => `${row}.${q(link.ownerColumn)}`;
    const label = (row: 'OLD' | 'NEW') => `(SELECT name FROM ${q(link.targetTable)} WHERE id = ${row}.${q(link.targetColumn)})`;
    return [
      make('ins', 'INSERT', insertRow('update', link.entity, owner('NEW'), lit(link.field), 'NULL', label('NEW'))),
      make('del', 'DELETE', insertRow('update', link.entity, owner('OLD'), lit(link.field), label('OLD'), 'NULL')),
    ];
  }

  const updates = cols
    .filter((c) => c.pk === 0)
    .map((c) =>
      insertRow('update', t, recordIdOf('NEW', table), lit(c.name), valueOf('OLD', c), valueOf('NEW', c), ` WHERE OLD.${q(c.name)} IS NOT NEW.${q(c.name)}`),
    );

  const out = [
    make('ins', 'INSERT', insertRow('create', t, recordIdOf('NEW', table), 'NULL', 'NULL', snapshot('NEW', cols))),
    make('del', 'DELETE', insertRow('delete', t, recordIdOf('OLD', table), 'NULL', snapshot('OLD', cols), 'NULL')),
  ];
  if (updates.length) out.push(make('upd', 'UPDATE', updates.join('\n')));
  return out;
}

export function auditStatements(tables: TableInfo[]): AuditStatement[] {
  return tables.filter((t) => !UNAUDITED_TABLES.includes(t.name)).flatMap(auditStatementsFor);
}

interface RawRunner {
  $executeRawUnsafe(sql: string): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
  $transaction(queries: Promise<unknown>[]): Promise<unknown>;
}

/** Read every table and its columns from the database. */
export async function readTables(db: Pick<RawRunner, '$queryRawUnsafe'>): Promise<TableInfo[]> {
  const names = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`,
  );
  const tables: TableInfo[] = [];
  for (const { name } of names) {
    const columns = await db.$queryRawUnsafe<{ name: string; type: string; pk: number | bigint }[]>(`SELECT name, type, pk FROM pragma_table_info(${lit(name)})`);
    tables.push({ name, columns: columns.map((c) => ({ name: c.name, type: c.type, pk: Number(c.pk) })) });
  }
  return tables;
}

/**
 * The audit triggers that exist. The name is compared as plain text: in a LIKE pattern
 * an underscore means 'any character', which once made this reach other rules whose
 * names merely look similar (crm_audit_log_no_update) and delete them.
 */
async function ourTriggers(db: Pick<RawRunner, '$queryRawUnsafe'>) {
  const all = await db.$queryRawUnsafe<{ name: string; sql: string }[]>(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`);
  return all.filter((t) => t.name.startsWith(TRIGGER_PREFIX));
}

/**
 * Make the audit triggers match the tables as they are now. Anything that is
 * already right is left alone. Throws if the result is not complete, so the app
 * never runs with auditing quietly switched off.
 */
export async function ensureAuditTriggers(db: RawRunner): Promise<{ changed: number; skipped?: boolean }> {
  const tables = await readTables(db);
  // Triggers that write to a table that is not there yet would make every save fail.
  // That is the case in the moment before the migration that creates the tables has run.
  const present = new Set(tables.map((t) => t.name));
  if (!present.has('audit_log') || !present.has('audit_actor')) return { changed: 0, skipped: true };
  const wanted = auditStatements(tables);
  const existing = await ourTriggers(db);
  const have = new Map(existing.map((e) => [e.name, e.sql]));
  const wantedNames = new Set(wanted.map((w) => w.name));

  const stale = existing.filter((e) => !wantedNames.has(e.name)).map((e) => e.name);
  const outOfDate = wanted.filter((w) => have.has(w.name) && have.get(w.name) !== w.sql);
  const missing = wanted.filter((w) => !have.has(w.name));

  const queries: Promise<unknown>[] = [];
  for (const name of [...stale, ...outOfDate.map((w) => w.name)]) queries.push(db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name}`));
  for (const s of [...outOfDate, ...missing]) queries.push(db.$executeRawUnsafe(s.sql));
  if (queries.length) await db.$transaction(queries);

  const after = new Set((await ourTriggers(db)).map((r) => r.name));
  const absent = wanted.filter((w) => !after.has(w.name)).map((w) => w.name);
  if (absent.length) throw new Error(`Audit triggers are missing and could not be created: ${absent.join(', ')}`);
  return { changed: queries.length };
}
