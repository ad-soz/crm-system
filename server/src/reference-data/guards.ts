/**
 * Database-level rules for reference data.
 *
 * Foreign keys (declared in schema.prisma) already make the database refuse
 * unknown values and refuse deleting a value that is in use. The rules below
 * cover what Prisma's schema language cannot express: retired values, at least
 * one active value, a single default, single-versus-multiple choice, name
 * rules, and the allowed stage outcomes. They are SQLite triggers and indexes,
 * so they hold for every client: the app, the API, imports, and anything that
 * opens the database directly.
 *
 * Prisma recreates a table whenever a migration changes certain columns, and
 * that silently drops the table's triggers. So ensureGuards() re-creates any
 * missing rule every time the server starts, and fails loudly if it can't.
 * Every statement is idempotent (IF NOT EXISTS). If a rule's text ever changes,
 * give it a new name and add a migration; existing names are never updated.
 *
 * Messages begin with CRM_REF: so the API can show them to the user.
 */

export interface GuardStatement {
  name: string;
  sql: string;
}

export interface RefTable {
  table: string;
  /** Singular noun used in messages. */
  noun: string;
  /** The field it feeds must have a value, so there is a default and at least one active value. */
  required: boolean;
  consumers: { table: string; column: string }[];
}

export const REF_TABLES: RefTable[] = [
  { table: 'industries', noun: 'industry', required: false, consumers: [{ table: 'company_industries', column: 'industry_id' }] },
  { table: 'deal_stages', noun: 'deal stage', required: true, consumers: [{ table: 'deals', column: 'stage_id' }] },
  { table: 'contact_types', noun: 'contact type', required: true, consumers: [{ table: 'contacts', column: 'type_id' }] },
  { table: 'task_statuses', noun: 'task status', required: true, consumers: [{ table: 'tasks', column: 'status_id' }] },
  { table: 'task_priorities', noun: 'task priority', required: true, consumers: [{ table: 'tasks', column: 'priority_id' }] },
];

/** Fields that can be switched between one value and several in the UI. */
export const MULTI_FIELDS = [
  { fieldKey: 'company.industry', junction: 'company_industries', owner: 'company_id', noun: 'industry', ownerNoun: 'company' },
];

export const STAGE_OUTCOMES = ['OPEN', 'WON', 'LOST'] as const;
export const REF_MESSAGE_PREFIX = 'CRM_REF:';

/**
 * Classify a database error so services can turn it into a clear message.
 *
 * A trigger failure carries our own CRM_REF: text. A plain foreign-key or
 * unique failure comes from the schema itself: Prisma reports it with a code
 * (P2003 / P2002) and a worded message, while a raw SQLite driver reports the
 * classic "FOREIGN KEY constraint failed" / "UNIQUE constraint failed". We
 * recognise both so the same handling works in tests and in production.
 */
export function classifyDbError(err: any): { kind: 'guard'; message: string } | { kind: 'foreignKey' } | { kind: 'unique' } | null {
  const message = String(err?.message ?? '');
  const code = String(err?.code ?? '');

  const marker = message.indexOf(REF_MESSAGE_PREFIX);
  if (marker >= 0) {
    return { kind: 'guard', message: message.slice(marker + REF_MESSAGE_PREFIX.length).trim() };
  }
  if (code === 'P2003' || /FOREIGN KEY constraint (failed|violated)/i.test(message) || /Foreign key constraint violated/i.test(message)) {
    return { kind: 'foreignKey' };
  }
  if (code === 'P2002' || /UNIQUE constraint (failed|violated)/i.test(message) || /Unique constraint failed/i.test(message)) {
    return { kind: 'unique' };
  }
  return null;
}

// Messages sit inside SQL string literals, so they must not contain quotes.
const trigger = (
  name: string,
  timing: 'BEFORE',
  event: string,
  table: string,
  when: string,
  message: string,
): GuardStatement => {
  if (/['"]/.test(message)) throw new Error(`Guard message for ${name} contains a quote`);
  return {
    name,
    sql:
      `CREATE TRIGGER IF NOT EXISTS ${name} ${timing} ${event} ON ${table}\n` +
      `WHEN ${when}\n` +
      `BEGIN SELECT RAISE(ABORT, '${REF_MESSAGE_PREFIX} ${message}'); END`,
  };
};

const index = (name: string, sql: string): GuardStatement => ({ name, sql });

export function guardStatements(): GuardStatement[] {
  const out: GuardStatement[] = [];

  for (const t of REF_TABLES) {
    const nameBad = (row: 'NEW') => `length(trim(${row}.name)) = 0 OR length(${row}.name) > 60`;
    const nameMsg = 'A name is required and must be 60 characters or fewer';

    out.push(index(`crm_ux_${t.table}_name`, `CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_${t.table}_name ON ${t.table} (lower(name))`));
    out.push(trigger(`crm_${t.table}_name_ins`, 'BEFORE', 'INSERT', t.table, nameBad('NEW'), nameMsg));
    out.push(trigger(`crm_${t.table}_name_upd`, 'BEFORE', 'UPDATE OF name', t.table, nameBad('NEW'), nameMsg));

    // A retired value cannot be newly chosen (records that already have it keep it).
    for (const c of t.consumers) {
      const active = `(SELECT is_active FROM ${t.table} WHERE id = NEW.${c.column}) = 0`;
      const msg = `That ${t.noun} has been retired and cannot be chosen`;
      out.push(trigger(`crm_${c.table}_${c.column}_active_ins`, 'BEFORE', 'INSERT', c.table, active, msg));
      out.push(
        trigger(`crm_${c.table}_${c.column}_active_upd`, 'BEFORE', `UPDATE OF ${c.column}`, c.table, `NEW.${c.column} <> OLD.${c.column} AND ${active}`, msg),
      );
    }

    if (t.required) {
      const others = (alias: 'NEW' | 'OLD') => `(SELECT COUNT(*) FROM ${t.table} WHERE is_active = 1 AND id <> ${alias}.id) = 0`;
      const keepMsg = `At least one ${t.noun} must stay active`;
      const defaultMsg = `The default ${t.noun} must be active`;

      out.push(index(`crm_ux_${t.table}_one_default`, `CREATE UNIQUE INDEX IF NOT EXISTS crm_ux_${t.table}_one_default ON ${t.table} (is_default) WHERE is_default = 1`));
      out.push(trigger(`crm_${t.table}_default_active_ins`, 'BEFORE', 'INSERT', t.table, 'NEW.is_default = 1 AND NEW.is_active = 0', defaultMsg));
      out.push(trigger(`crm_${t.table}_default_active_upd`, 'BEFORE', 'UPDATE OF is_default, is_active', t.table, 'NEW.is_default = 1 AND NEW.is_active = 0', defaultMsg));
      out.push(trigger(`crm_${t.table}_keep_active_upd`, 'BEFORE', 'UPDATE OF is_active', t.table, `OLD.is_active = 1 AND NEW.is_active = 0 AND ${others('NEW')}`, keepMsg));
      out.push(trigger(`crm_${t.table}_keep_active_del`, 'BEFORE', 'DELETE', t.table, `OLD.is_active = 1 AND ${others('OLD')}`, keepMsg));
    }
  }

  const outcomes = STAGE_OUTCOMES.map((o) => `'${o}'`).join(', ');
  const outcomeMsg = 'A stage outcome must be Open, Won or Lost';
  out.push(trigger('crm_deal_stages_outcome_ins', 'BEFORE', 'INSERT', 'deal_stages', `NEW.outcome NOT IN (${outcomes})`, outcomeMsg));
  out.push(trigger('crm_deal_stages_outcome_upd', 'BEFORE', 'UPDATE OF outcome', 'deal_stages', `NEW.outcome NOT IN (${outcomes})`, outcomeMsg));

  // A stage's win chance is a percentage.
  const chanceBad = 'NEW.win_chance < 0 OR NEW.win_chance > 100';
  const chanceMsg = 'A win chance must be between 0 and 100';
  out.push(trigger('crm_deal_stages_win_chance_ins', 'BEFORE', 'INSERT', 'deal_stages', chanceBad, chanceMsg));
  out.push(trigger('crm_deal_stages_win_chance_upd', 'BEFORE', 'UPDATE OF win_chance', 'deal_stages', chanceBad, chanceMsg));

  // ---- Deal stage moves need a comment ----
  //
  // A move needs a row in deal_stage_changes (who, when, why). Each row authorises
  // exactly one move: the database marks it used when the move happens, so a
  // comment can't be reused and nothing can move a deal by going around the API.
  // The history itself can't be edited or deleted (it goes only when its deal is deleted).
  const stageMove = 'NEW.stage_id <> OLD.stage_id';
  const matching = `c.deal_id = NEW.id AND c.from_stage_id = OLD.stage_id AND c.to_stage_id = NEW.stage_id AND c.applied = 0`;
  out.push(
    trigger(
      'crm_deals_stage_needs_comment',
      'BEFORE',
      'UPDATE OF stage_id',
      'deals',
      `${stageMove} AND NOT EXISTS (SELECT 1 FROM deal_stage_changes c WHERE ${matching})`,
      'Moving a deal to another stage needs a comment explaining why',
    ),
  );
  out.push({
    name: 'crm_deals_stage_use_comment',
    sql:
      `CREATE TRIGGER IF NOT EXISTS crm_deals_stage_use_comment AFTER UPDATE OF stage_id ON deals\n` +
      `WHEN ${stageMove}\n` +
      `BEGIN UPDATE deal_stage_changes SET applied = 1 WHERE id = ` +
      `(SELECT c.id FROM deal_stage_changes c WHERE ${matching} ORDER BY c.created_at, c.id LIMIT 1); END`,
  });
  out.push(
    trigger(
      'crm_deal_stage_changes_comment',
      'BEFORE',
      'INSERT',
      'deal_stage_changes',
      'length(trim(NEW.comment)) = 0 OR length(NEW.comment) > 1000',
      'A comment of 1 to 1000 characters is required when a deal changes stage',
    ),
  );
  out.push(
    trigger(
      'crm_deal_stage_changes_different',
      'BEFORE',
      'INSERT',
      'deal_stage_changes',
      'NEW.from_stage_id = NEW.to_stage_id',
      'A stage change must go to a different stage',
    ),
  );
  // A history row never changes, with exactly two exceptions: the database marks it
  // "used" when the move it authorised happens, and the link to a person is blanked
  // when that person is removed (their name stays on the row, so history still reads).
  const sameFacts =
    `NEW.id = OLD.id AND NEW.deal_id = OLD.deal_id AND NEW.from_stage_id = OLD.from_stage_id ` +
    `AND NEW.to_stage_id = OLD.to_stage_id AND NEW.comment = OLD.comment ` +
    `AND NEW.user_name = OLD.user_name AND NEW.created_at = OLD.created_at`;
  out.push(
    trigger(
      'crm_deal_stage_changes_readonly',
      'BEFORE',
      'UPDATE',
      'deal_stage_changes',
      `NOT (${sameFacts} AND (` +
        `(OLD.applied = 0 AND NEW.applied = 1 AND NEW.user_id IS OLD.user_id) ` +
        `OR (NEW.applied = OLD.applied AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)))`,
      'Stage history cannot be changed',
    ),
  );
  out.push(
    trigger(
      'crm_deal_stage_changes_keep',
      'BEFORE',
      'DELETE',
      'deal_stage_changes',
      'EXISTS (SELECT 1 FROM deals WHERE id = OLD.deal_id)',
      'Stage history cannot be deleted',
    ),
  );

  // ---- A task agrees with the Contact it came from ----
  //
  // A task that names a Contact (touchpoint) may not be about a different person or
  // deal than that Contact. Where either side leaves person or deal blank there is
  // nothing to contradict. The same rule holds when a Contact is later re-pointed.
  const taskClash = (c: string) =>
    `(NEW.person_id IS NOT NULL AND (SELECT person_id FROM contacts WHERE id = ${c}) IS NOT NULL AND NEW.person_id <> (SELECT person_id FROM contacts WHERE id = ${c})) ` +
    `OR (NEW.deal_id IS NOT NULL AND (SELECT deal_id FROM contacts WHERE id = ${c}) IS NOT NULL AND NEW.deal_id <> (SELECT deal_id FROM contacts WHERE id = ${c}))`;
  const taskClashMsg = 'A task cannot be about a different person or deal than the contact it follows up';
  out.push(trigger('crm_tasks_contact_agrees_ins', 'BEFORE', 'INSERT', 'tasks', `NEW.contact_id IS NOT NULL AND (${taskClash('NEW.contact_id')})`, taskClashMsg));
  out.push(
    trigger(
      'crm_tasks_contact_agrees_upd',
      'BEFORE',
      'UPDATE OF contact_id, person_id, deal_id',
      'tasks',
      `NEW.contact_id IS NOT NULL AND (${taskClash('NEW.contact_id')})`,
      taskClashMsg,
    ),
  );
  out.push(
    trigger(
      'crm_contacts_keep_tasks_agreeing',
      'BEFORE',
      'UPDATE OF person_id, deal_id',
      'contacts',
      `EXISTS (SELECT 1 FROM tasks t WHERE t.contact_id = NEW.id AND ` +
        `((t.person_id IS NOT NULL AND NEW.person_id IS NOT NULL AND t.person_id <> NEW.person_id) ` +
        `OR (t.deal_id IS NOT NULL AND NEW.deal_id IS NOT NULL AND t.deal_id <> NEW.deal_id)))`,
      'This contact has follow-up tasks about a different person or deal. Change or remove those tasks first',
    ),
  );

  // ---- The audit log can only grow ----
  //
  // History that can be edited or deleted is not evidence. The database refuses both,
  // for everyone, including administrators and anything that opens the file directly.
  out.push(trigger('crm_audit_log_no_update', 'BEFORE', 'UPDATE', 'audit_log', '1', 'The audit log cannot be changed'));
  out.push(trigger('crm_audit_log_no_delete', 'BEFORE', 'DELETE', 'audit_log', '1', 'The audit log cannot be deleted from'));

  // Single versus multiple choice, switched in the UI.
  for (const f of MULTI_FIELDS) {
    out.push(
      trigger(
        `crm_${f.junction}_cardinality`,
        'BEFORE',
        'INSERT',
        f.junction,
        `(SELECT allow_multiple FROM reference_field_settings WHERE field_key = '${f.fieldKey}') = 0 AND EXISTS (SELECT 1 FROM ${f.junction} WHERE ${f.owner} = NEW.${f.owner})`,
        `Only one ${f.noun} is allowed per ${f.ownerNoun}. An administrator can allow several`,
      ),
    );
    out.push(
      trigger(
        `crm_reference_field_settings_single_${f.junction}`,
        'BEFORE',
        'UPDATE OF allow_multiple',
        'reference_field_settings',
        `NEW.allow_multiple = 0 AND NEW.field_key = '${f.fieldKey}' AND EXISTS (SELECT 1 FROM ${f.junction} GROUP BY ${f.owner} HAVING COUNT(*) > 1)`,
        `Some ${f.ownerNoun} records already have more than one ${f.noun}. Reduce them to one before switching this off`,
      ),
    );
  }
  const keys = MULTI_FIELDS.map((f) => `'${f.fieldKey}'`).join(', ');
  out.push(trigger('crm_reference_field_settings_keys', 'BEFORE', 'INSERT', 'reference_field_settings', `NEW.field_key NOT IN (${keys})`, 'That is not a field that can be configured'));
  out.push(trigger('crm_reference_field_settings_keep', 'BEFORE', 'DELETE', 'reference_field_settings', '1', 'Field settings cannot be deleted'));

  return out;
}

export const GUARD_NAMES = guardStatements().map((s) => s.name);

/** SQL text for a migration file. */
export function guardsAsMigrationSql(): string {
  return guardStatements()
    .map((s) => `${s.sql};`)
    .join('\n\n');
}

interface RawRunner {
  $executeRawUnsafe(sql: string): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
}

/**
 * Create any missing rule, then confirm every rule exists. Throws if one is
 * still missing, so the app never runs with the database rules switched off.
 */
export async function ensureGuards(db: RawRunner): Promise<{ created: string[] }> {
  const existing = async () =>
    new Set((await db.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE name LIKE 'crm\\_%' ESCAPE '\\'`)).map((r) => r.name));

  const before = await existing();
  const statements = guardStatements();
  const missing = statements.filter((s) => !before.has(s.name));
  for (const s of missing) await db.$executeRawUnsafe(s.sql);

  const after = await existing();
  const stillMissing = statements.filter((s) => !after.has(s.name)).map((s) => s.name);
  if (stillMissing.length) {
    throw new Error(`Database rules are missing and could not be created: ${stillMissing.join(', ')}`);
  }
  return { created: missing.map((s) => s.name) };
}
