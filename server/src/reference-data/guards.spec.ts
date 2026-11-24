import { GUARD_NAMES, guardStatements, guardsAsMigrationSql, REF_MESSAGE_PREFIX } from './guards';

describe('reference-data guards', () => {
  it('produces uniquely named statements', () => {
    const names = guardStatements().map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(GUARD_NAMES.length).toBeGreaterThan(30);
  });

  it('names every statement with the crm_ prefix so they can be found and restored', () => {
    expect(guardStatements().every((s) => s.name.startsWith('crm_'))).toBe(true);
  });

  it('prefixes user-facing trigger messages and keeps them quote-free', () => {
    for (const s of guardStatements()) {
      if (s.sql.includes('RAISE(ABORT')) {
        const msg = s.sql.match(/RAISE\(ABORT, '([^']*)'\)/)?.[1] ?? '';
        expect(msg.startsWith(REF_MESSAGE_PREFIX)).toBe(true);
      }
    }
  });

  it('emits runnable SQL for a migration', () => {
    const sql = guardsAsMigrationSql();
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(sql.trim().endsWith(';')).toBe(true);
  });

  it('enforces a single default and keeping one active value for required lists only', () => {
    const names = GUARD_NAMES.join(' ');
    expect(names).toContain('crm_ux_deal_stages_one_default');
    expect(names).toContain('crm_deal_stages_keep_active_del');
    // industries are optional: no default/keep-active rules
    expect(names).not.toContain('crm_ux_industries_one_default');
    expect(names).not.toContain('crm_industries_keep_active_del');
  });
});
