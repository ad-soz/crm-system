import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { readTables, TableInfo, UNAUDITED_TABLES, LINK_TABLES } from './audit-triggers';

/** What the screen calls each kind of record. */
const ENTITY_LABELS: Record<string, string> = {
  people: 'Person',
  companies: 'Company',
  deals: 'Deal',
  contacts: 'Contact',
  tasks: 'Task',
  users: 'User',
  role_profiles: 'Role profile',
  industries: 'Industry',
  deal_stages: 'Deal stage',
  contact_types: 'Contact type',
  task_statuses: 'Task status',
  task_priorities: 'Task priority',
  app_settings: 'Setting',
  reference_field_settings: 'Field setting',
  session: 'Sign-in',
  backups: 'Backup',
};

/** Columns that name a record, best first. */
// A person has a job "title" as well as a name, so first and last name must come before "title".
const LABEL_COLUMNS = [['firstName', 'lastName'], ['first_name', 'last_name'], ['name'], ['title'], ['subject'], ['key'], ['field_key'], ['email']];

export function humanize(column: string): string {
  const base = column.replace(/(_id|Id)$/, '');
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : column;
}

export function entityLabel(table: string): string {
  return ENTITY_LABELS[table] ?? humanize(table);
}

export interface AuditQuery {
  entity?: string;
  recordId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: { id: string | null; name: string } | null;
  action: string;
  entity: string;
  entityLabel: string;
  recordId: string | null;
  recordLabel: string | null;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  /** For a create or a delete: every value the record had, as readable text. */
  values: { field: string; value: string }[] | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  // Write requests run one at a time, so the "who is acting" stamp is never shared.
  private tail: Promise<unknown> = Promise.resolve();
  private tables: Promise<TableInfo[]> | null = null;

  constructor(private prisma: PrismaService) {}

  /**
   * Run `work` with `userId` named on every change it makes. Only one such piece
   * of work runs at a time: SQLite lets one writer in at a time anyway, and this
   * keeps two people's changes from being credited to each other.
   */
  runAs<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const run = async () => {
      await this.setActor(userId);
      try {
        return await work();
      } finally {
        await this.clearActor();
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async setActor(userId: string) {
    const now = new Date().toISOString();
    await this.prisma.$executeRaw`
      INSERT OR REPLACE INTO audit_actor (id, actor_id, actor_name, set_at)
      VALUES (1, ${userId},
        (SELECT trim(firstName || ' ' || lastName) FROM users WHERE id = ${userId}),
        ${now})`;
  }

  /** Never throws: a failure here must not turn a saved change into an error. */
  async clearActor() {
    try {
      await this.prisma.$executeRaw`DELETE FROM audit_actor`;
    } catch (err: any) {
      this.logger.error(`Could not clear the acting user: ${err?.message ?? err}`);
    }
  }

  /** Record something that is not a change to a record (a sign-in, an export, a backup). */
  async event(action: string, event: { actorId?: string | null; entity: string; recordId?: string | null; detail?: string | null }) {
    try {
      let actorName: string | null = null;
      if (event.actorId) {
        const u = await this.prisma.user.findUnique({ where: { id: event.actorId }, select: { firstName: true, lastName: true } });
        actorName = u ? `${u.firstName} ${u.lastName}`.trim() : null;
      }
      await this.prisma.auditLog.create({
        data: {
          at: new Date().toISOString(),
          actorId: event.actorId ?? null,
          actorName,
          action,
          entity: event.entity,
          recordId: event.recordId ?? null,
          newValue: event.detail ?? null,
        },
      });
    } catch (err: any) {
      // A failure to log must never stop the action itself.
      this.logger.error(`Could not record "${action}": ${err?.message ?? err}`);
    }
  }

  /** Failed sign-ins are recorded, but a flood of them (someone guessing) is not allowed to fill the log. */
  async failedSignInAllowed(): Promise<boolean> {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recent = await this.prisma.auditLog.count({ where: { action: 'sign_in_failed', at: { gte: since } } });
    return recent < 200;
  }

  async since(): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'audit_since' } });
    return row?.value ?? null;
  }

  private getTables() {
    if (!this.tables) this.tables = readTables(this.prisma);
    return this.tables;
  }

  async list(q: AuditQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));
    const where: any = {};
    if (q.entity) where.entity = q.entity;
    if (q.recordId) where.recordId = q.recordId;
    if (q.actorId) where.actorId = q.actorId === 'system' ? null : q.actorId;
    if (q.action) where.action = q.action;
    if (q.from || q.to) {
      where.at = {};
      if (q.from) where.at.gte = q.from;
      if (q.to) where.at.lte = q.to;
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: await this.describe(rows), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** The people who appear in the log, for the filter (a user since removed still shows by name). */
  async actors() {
    const rows = await this.prisma.auditLog.findMany({
      where: { actorId: { not: null } },
      distinct: ['actorId'],
      select: { actorId: true, actorName: true },
      orderBy: { actorName: 'asc' },
    });
    return rows.map((r) => ({ id: r.actorId as string, name: r.actorName ?? 'Unknown user' }));
  }

  /** The record types that appear in the log, for the filter. */
  async entities() {
    const rows = await this.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } });
    return rows.map((r) => ({ value: r.entity, label: entityLabel(r.entity) }));
  }

  // ---- turning stored rows into something readable ----

  private async describe(rows: any[]): Promise<AuditEntry[]> {
    const tables = await this.getTables();
    const byName = new Map(tables.map((t) => [t.name, t]));
    const labelCache = new Map<string, string>();

    // Names for the records and for the values that point at other records.
    const wanted = new Map<string, Set<string>>();
    const want = (table: string, id: string | null | undefined) => {
      if (!id || !byName.has(table)) return;
      if (!wanted.has(table)) wanted.set(table, new Set());
      wanted.get(table)!.add(id);
    };
    const fks = new Map<string, Map<string, string>>();
    for (const r of rows) {
      if (!byName.has(r.entity)) continue;
      if (!fks.has(r.entity)) fks.set(r.entity, await this.foreignKeys(r.entity));
      want(r.entity, r.recordId);
      const fk = fks.get(r.entity)!;
      if (r.field && fk.has(r.field)) {
        want(fk.get(r.field)!, r.oldValue);
        want(fk.get(r.field)!, r.newValue);
      }
      for (const json of [r.oldValue, r.newValue]) {
        const snap = !r.field ? this.parse(json) : null;
        if (snap) for (const [col, value] of Object.entries(snap)) if (fk.has(col)) want(fk.get(col)!, value as string);
      }
    }
    for (const [table, ids] of wanted) await this.loadLabels(table, [...ids], byName.get(table)!, labelCache);

    // A record that has since been deleted is named from what it looked like when it was deleted.
    const unnamed: { table: string; id: string }[] = [];
    for (const [table, ids] of wanted) for (const id of ids) if (!labelCache.has(`${table}:${id}`)) unnamed.push({ table, id });
    if (unnamed.length) {
      const gone = await this.prisma.auditLog.findMany({
        where: { action: 'delete', OR: unnamed.map((u) => ({ entity: u.table, recordId: u.id })) },
      });
      for (const g of gone) {
        const snap = this.parse(g.oldValue);
        const label = snap && this.labelFrom(byName.get(g.entity)!, snap);
        if (label) labelCache.set(`${g.entity}:${g.recordId}`, `${label} (deleted)`);
      }
    }
    const show = (table: string | undefined, value: string | null) => {
      if (value === null || value === undefined) return null;
      if (!table) return value;
      return labelCache.get(`${table}:${value}`) ?? (value ? `${value} (removed)` : value);
    };

    return rows.map((r) => {
      const fk = fks.get(r.entity);
      const target = r.field ? fk?.get(r.field) : undefined;
      const snapSource = !r.field ? (r.action === 'delete' ? r.oldValue : r.action === 'create' ? r.newValue : null) : null;
      const snap = this.parse(snapSource);
      return {
        id: r.id,
        at: r.at,
        actor: r.actorName || r.actorId ? { id: r.actorId, name: r.actorName ?? 'Unknown user' } : null,
        action: r.action,
        entity: r.entity,
        entityLabel: entityLabel(r.entity),
        recordId: r.recordId,
        recordLabel: r.recordId && byName.has(r.entity) ? (labelCache.get(`${r.entity}:${r.recordId}`) ?? null) : null,
        field: r.field,
        fieldLabel: r.field ? humanize(r.field) : null,
        oldValue: target ? show(target, r.oldValue) : r.oldValue,
        newValue: target ? show(target, r.newValue) : r.newValue,
        values: snap
          ? Object.entries(snap)
              .filter(([, v]) => v !== null && v !== '')
              .map(([col, v]) => ({
                field: humanize(col),
                value: fk?.has(col) ? (show(fk.get(col), String(v)) ?? '') : String(v),
              }))
          : null,
      };
    });
  }

  private parse(json: string | null): Record<string, unknown> | null {
    if (!json || json[0] !== '{') return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private labelColumns(table: TableInfo): string[] | null {
    const names = new Set(table.columns.map((c) => c.name));
    return LABEL_COLUMNS.find((cols) => cols.every((c) => names.has(c))) ?? null;
  }

  private labelFrom(table: TableInfo, snap: Record<string, unknown>): string | null {
    const cols = this.labelColumns(table);
    if (!cols) return null;
    const text = cols.map((c) => snap[c]).filter(Boolean).join(' ').trim();
    return text || null;
  }

  private async foreignKeys(table: string): Promise<Map<string, string>> {
    const link = LINK_TABLES[table];
    if (link || UNAUDITED_TABLES.includes(table)) return new Map();
    const rows = await this.prisma.$queryRawUnsafe<{ from: string; table: string }[]>(`SELECT "from", "table" FROM pragma_foreign_key_list('${table.replace(/'/g, "''")}')`);
    return new Map(rows.map((r) => [r.from, r.table]));
  }

  private async loadLabels(table: string, ids: string[], info: TableInfo, cache: Map<string, string>) {
    const cols = this.labelColumns(info);
    const idCol = info.columns.find((c) => c.name === 'id') ? 'id' : info.columns.find((c) => c.pk === 1)?.name;
    if (!cols || !idCol || !ids.length) return;
    const quote = (n: string) => `"${n.replace(/"/g, '""')}"`;
    const expr = cols.length > 1 ? cols.map(quote).join(` || ' ' || `) : quote(cols[0]);
    const marks = ids.map(() => '?').join(',');
    const found = await this.prisma.$queryRawUnsafe<{ id: string; label: string }[]>(
      `SELECT ${quote(idCol)} AS id, trim(${expr}) AS label FROM ${quote(table)} WHERE ${quote(idCol)} IN (${marks})`,
      ...ids,
    );
    for (const f of found) if (f.label) cache.set(`${table}:${f.id}`, f.label);
  }
}
