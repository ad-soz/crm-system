import { auditStatements, auditStatementsFor, ensureAuditTriggers, isAuditedColumn, TableInfo } from './audit-triggers';
import { humanize, entityLabel } from './audit.service';

// The triggers are plain SQL, so they are tested against a real in-memory SQLite database
// (Node's built-in one; the application itself uses the copy that comes with Prisma).
// getBuiltinModule is used because Jest's module loader does not know 'node:sqlite'.
const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
type Db = { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] }; close(): void };
const tables: TableInfo[] = [
  {
    name: 'deals',
    columns: [
      { name: 'id', type: 'TEXT', pk: 1 },
      { name: 'title', type: 'TEXT', pk: 0 },
      { name: 'amount', type: 'REAL', pk: 0 },
      { name: 'expectedCloseDate', type: 'DATETIME', pk: 0 },
      { name: 'won', type: 'BOOLEAN', pk: 0 },
      { name: 'updatedAt', type: 'DATETIME', pk: 0 },
    ],
  },
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'TEXT', pk: 1 },
      { name: 'email', type: 'TEXT', pk: 0 },
      { name: 'passwordHash', type: 'TEXT', pk: 0 },
    ],
  },
];

describe('audit trigger generator', () => {
  it('never records secrets or the save-time stamp', () => {
    expect(isAuditedColumn('passwordHash')).toBe(false);
    expect(isAuditedColumn('password_hash')).toBe(false);
    expect(isAuditedColumn('apiToken')).toBe(false);
    expect(isAuditedColumn('updatedAt')).toBe(false);
    expect(isAuditedColumn('title')).toBe(true);
    const sql = auditStatements(tables).map((s) => s.sql).join('\n');
    expect(sql).not.toMatch(/passwordHash/);
    expect(sql).not.toMatch(/updatedAt/);
  });

  it('makes a create, update and delete trigger for each table, with stable names', () => {
    const names = auditStatements(tables).map((s) => s.name);
    expect(names).toEqual(['crm_aud_deals_ins', 'crm_aud_deals_del', 'crm_aud_deals_upd', 'crm_aud_users_ins', 'crm_aud_users_del', 'crm_aud_users_upd']);
  });

  it('skips the tables that must not audit themselves', () => {
    const all = auditStatements([...tables, { name: 'audit_log', columns: [{ name: 'id', type: 'INTEGER', pk: 1 }] }, { name: '_prisma_migrations', columns: [{ name: 'id', type: 'TEXT', pk: 1 }] }]);
    expect(all.some((s) => s.name.includes('audit_log') || s.name.includes('_prisma'))).toBe(false);
  });

  it('is deterministic, so unchanged tables are not rebuilt at every start', () => {
    expect(auditStatementsFor(tables[0])).toEqual(auditStatementsFor(tables[0]));
  });
});

describe('audit triggers in a real database', () => {
  let db: Db;
  const rows = () => db.prepare('SELECT * FROM audit_log ORDER BY id').all() as any[];

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT, actor_name TEXT, action TEXT NOT NULL,
        entity TEXT NOT NULL, record_id TEXT, field TEXT, old_value TEXT, new_value TEXT);
      CREATE TABLE audit_actor (id INTEGER PRIMARY KEY, actor_id TEXT, actor_name TEXT, set_at TEXT NOT NULL);
      CREATE TABLE deals (id TEXT PRIMARY KEY, title TEXT, amount REAL, expectedCloseDate DATETIME, won BOOLEAN, updatedAt DATETIME);
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, passwordHash TEXT);
    `);
    for (const s of auditStatements(tables)) db.exec(s.sql);
  });
  afterEach(() => db.close());

  const actAs = (id: string, name: string, at = new Date().toISOString()) =>
    db.prepare('INSERT OR REPLACE INTO audit_actor VALUES (1, ?, ?, ?)').run(id, name, at);

  it('records a create with every value, and who made it', () => {
    actAs('u1', 'Ann Rep');
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    const [r] = rows();
    expect(r).toMatchObject({ action: 'create', entity: 'deals', record_id: 'd1', field: null, actor_id: 'u1', actor_name: 'Ann Rep' });
    expect(JSON.parse(r.new_value)).toMatchObject({ id: 'd1', title: 'Acme', amount: '1000', won: 'false' });
    expect(JSON.parse(r.new_value)).not.toHaveProperty('updatedAt');
  });

  it('records one row per field that really changed, old and new', () => {
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    actAs('u2', 'Bob Manager');
    db.prepare(`UPDATE deals SET title = 'Acme ERP', amount = 1500, updatedAt = 99 WHERE id = 'd1'`).run();
    const changes = rows().filter((r) => r.action === 'update');
    expect(changes.map((c) => [c.field, c.old_value, c.new_value]).sort()).toEqual([
      ['amount', '1000', '1500'],
      ['title', 'Acme', 'Acme ERP'],
    ]);
    expect(changes.every((c) => c.actor_id === 'u2' && c.record_id === 'd1')).toBe(true);
  });

  it('records nothing when a save changes nothing', () => {
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    const before = rows().length;
    db.prepare(`UPDATE deals SET title = 'Acme', amount = 1000 WHERE id = 'd1'`).run();
    db.prepare(`UPDATE deals SET updatedAt = 5 WHERE id = 'd1'`).run();
    expect(rows().length).toBe(before);
  });

  it('records a change to or from empty', () => {
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    db.prepare(`UPDATE deals SET expectedCloseDate = 1798761600000 WHERE id = 'd1'`).run();
    db.prepare(`UPDATE deals SET expectedCloseDate = NULL WHERE id = 'd1'`).run();
    const dates = rows().filter((r) => r.field === 'expectedCloseDate');
    expect(dates[0]).toMatchObject({ old_value: null, new_value: '2027-01-01T00:00:00.000Z' });
    expect(dates[1]).toMatchObject({ old_value: '2027-01-01T00:00:00.000Z', new_value: null });
  });

  it('shows booleans as true and false', () => {
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    db.prepare(`UPDATE deals SET won = 1 WHERE id = 'd1'`).run();
    expect(rows().find((r) => r.field === 'won')).toMatchObject({ old_value: 'false', new_value: 'true' });
  });

  it('keeps what a deleted record looked like', () => {
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    actAs('u3', 'Cy Admin');
    db.prepare(`DELETE FROM deals WHERE id = 'd1'`).run();
    const del = rows().find((r) => r.action === 'delete')!;
    expect(del).toMatchObject({ entity: 'deals', record_id: 'd1', actor_name: 'Cy Admin' });
    expect(JSON.parse(del.old_value)).toMatchObject({ title: 'Acme', amount: '1000' });
  });

  it('never writes a password, even though the user record is audited', () => {
    db.prepare(`INSERT INTO users VALUES ('u1', 'a@b.com', '$2a$secret-hash')`).run();
    db.prepare(`UPDATE users SET passwordHash = '$2a$another-hash', email = 'c@d.com' WHERE id = 'u1'`).run();
    const everything = JSON.stringify(rows());
    expect(everything).not.toContain('secret-hash');
    expect(everything).not.toContain('another-hash');
    expect(rows().filter((r) => r.field).map((r) => r.field)).toEqual(['email']);
  });

  it('shows no name for a change made with nobody acting (a script)', () => {
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    expect(rows()[0]).toMatchObject({ actor_id: null, actor_name: null });
  });

  it('ignores a name left behind by a request that never finished', () => {
    actAs('u1', 'Ann Rep', new Date(Date.now() - 10 * 60 * 1000).toISOString());
    db.prepare(`INSERT INTO deals VALUES ('d1', 'Acme', 1000, NULL, 0, 0)`).run();
    expect(rows()[0].actor_id).toBeNull();
  });

  it('saves the history and the change together, or neither', () => {
    db.exec(`CREATE TRIGGER block BEFORE INSERT ON deals WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'no'); END`);
    expect(() => db.prepare(`INSERT INTO deals VALUES ('bad', 'x', 1, NULL, 0, 0)`).run()).toThrow();
    expect(rows().length).toBe(0);
  });
});

describe('before the audit tables exist', () => {
  it('installs nothing, so that saving data keeps working until the update is applied', async () => {
    const db: Db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE deals (id TEXT PRIMARY KEY, title TEXT)`);
    const runner = {
      $queryRawUnsafe: async (sql: string) => db.prepare(sql).all() as any,
      $executeRawUnsafe: async (sql: string) => {
        db.exec(sql);
        return 0;
      },
      $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    expect(await ensureAuditTriggers(runner)).toEqual({ changed: 0, skipped: true });
    expect((db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'`).all() as unknown[]).length).toBe(0);
    expect(() => db.prepare(`INSERT INTO deals VALUES ('d1', 'x')`).run()).not.toThrow();
    db.close();
  });
});

describe('keeping the triggers up to date at start-up', () => {
  let db: Db;
  // Lets the real start-up code talk to the in-memory database.
  const runner = () => ({
    $queryRawUnsafe: async (sql: string) => db.prepare(sql).all() as any,
    $executeRawUnsafe: async (sql: string) => {
      db.exec(sql);
      return 0;
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  });
  const names = () => (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`).all() as { name: string }[]).map((r) => r.name);

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT, actor_name TEXT, action TEXT NOT NULL,
        entity TEXT NOT NULL, record_id TEXT, field TEXT, old_value TEXT, new_value TEXT);
      CREATE TABLE audit_actor (id INTEGER PRIMARY KEY, actor_id TEXT, actor_name TEXT, set_at TEXT NOT NULL);
      CREATE TABLE deals (id TEXT PRIMARY KEY, title TEXT);
    `);
  });
  afterEach(() => db.close());

  it('creates the triggers, and does nothing the second time', async () => {
    expect((await ensureAuditTriggers(runner())).changed).toBe(3);
    expect(names()).toEqual(['crm_aud_deals_del', 'crm_aud_deals_ins', 'crm_aud_deals_upd']);
    expect((await ensureAuditTriggers(runner())).changed).toBe(0);
  });

  it('does not touch other database rules, including ones whose names look similar', async () => {
    // A single underscore in a LIKE pattern matches any character: crm_audit_log_* once got deleted this way.
    db.exec(`CREATE TRIGGER crm_audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'no'); END`);
    db.exec(`CREATE TRIGGER crm_other_rule BEFORE DELETE ON deals BEGIN SELECT RAISE(ABORT, 'no'); END`);
    await ensureAuditTriggers(runner());
    await ensureAuditTriggers(runner());
    expect(names()).toEqual(expect.arrayContaining(['crm_audit_log_no_update', 'crm_other_rule']));
  });

  it('picks up a new column, and a new table, with no further work', async () => {
    await ensureAuditTriggers(runner());
    db.exec(`ALTER TABLE deals ADD COLUMN stage TEXT`);
    db.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)`);
    expect((await ensureAuditTriggers(runner())).changed).toBeGreaterThan(0);
    db.prepare(`INSERT INTO deals (id, title, stage) VALUES ('d1', 'x', 'Lead')`).run();
    db.prepare(`UPDATE deals SET stage = 'Won' WHERE id = 'd1'`).run();
    db.prepare(`INSERT INTO notes VALUES ('n1', 'hello')`).run();
    const log = db.prepare('SELECT entity, field, old_value, new_value FROM audit_log ORDER BY id').all() as any[];
    expect(log.find((r) => r.field === 'stage')).toMatchObject({ entity: 'deals', old_value: 'Lead', new_value: 'Won' });
    expect(log.some((r) => r.entity === 'notes')).toBe(true);
  });

  it('removes the triggers of a table that no longer exists', async () => {
    await ensureAuditTriggers(runner());
    db.exec(`DROP TABLE deals`);
    await ensureAuditTriggers(runner());
    expect(names()).toEqual([]);
  });
});

describe('readable names', () => {
  it('turns column names into words, dropping the id suffix', () => {
    expect(humanize('stage_id')).toBe('Stage');
    expect(humanize('expectedCloseDate')).toBe('Expected close date');
    expect(humanize('ownerId')).toBe('Owner');
    expect(humanize('first_name')).toBe('First name');
  });
  it('names record types the way the screens do', () => {
    expect(entityLabel('people')).toBe('Person');
    expect(entityLabel('deals')).toBe('Deal');
    expect(entityLabel('some_new_table')).toBe('Some new table');
  });
});
