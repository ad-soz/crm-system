import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { crmDataDir } from '../config/local-paths';

/**
 * Automatic database backups.
 *
 * A backup is a consistent copy of the live database made with SQLite's
 * VACUUM INTO, which is safe while the app is running. Every copy is opened and
 * integrity-checked before it is kept. Backups live in the private CRM folder,
 * not the OneDrive-synced project folder, because they contain customer data.
 *
 * A backup problem must never stop the app ("the application must always run"):
 * the scheduled path catches and records every error.
 */

export type BackupKind = 'auto' | 'manual' | 'pre-update';

export interface BackupInfo {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

/** How many of each kind to keep. Older ones are deleted after a new backup. */
export const KEEP: Record<BackupKind, number> = { auto: 14, manual: 10, 'pre-update': 5 };

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 30 * 1000;

const FILE_PATTERN = /^crm-(auto|manual|pre-update)-\d{8}-\d{6}-\d{3}\.db$/;

export function backupDir(): string {
  return process.env.CRM_BACKUP_DIR ?? join(crmDataDir(), 'backups');
}

function stamp(date: Date): string {
  // 2026-11-08T20:45:01.123Z -> 20261108-204501-123 (UTC, so daylight saving can't reorder files)
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace('.', '-')
    .replace('Z', '');
}

@Injectable()
export class BackupsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private running = false;
  private lastSuccess: Date | null = null;
  private lastError: { message: string; at: Date } | null = null;
  private firstTimer?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  // ---- Scheduling ----

  onApplicationBootstrap() {
    // Tests boot the whole app; they must not create backups or leave timers.
    if (process.env.JEST_WORKER_ID) return;
    this.firstTimer = setTimeout(() => void this.runIfDue(), FIRST_CHECK_DELAY_MS);
    this.timer = setInterval(() => void this.runIfDue(), CHECK_EVERY_MS);
    // Timers must never keep the process alive on their own.
    this.firstTimer.unref();
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.timer) clearInterval(this.timer);
  }

  /** Make an automatic backup if the newest one is older than 24 hours (or there is none). */
  async runIfDue(now: Date = new Date()): Promise<BackupInfo | null> {
    try {
      const newest = (await this.list()).find((b) => b.kind !== 'pre-update');
      if (newest && now.getTime() - new Date(newest.createdAt).getTime() < MAX_AGE_MS) return null;
      return await this.create('auto');
    } catch (err) {
      // create() has already recorded the error; never let it escape a timer.
      this.logger.error(`Scheduled backup failed: ${this.messageOf(err)}`);
      return null;
    }
  }

  // ---- Reading ----

  async list(): Promise<BackupInfo[]> {
    const dir = backupDir();
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
    const items: BackupInfo[] = [];
    for (const name of names) {
      const match = FILE_PATTERN.exec(name);
      if (!match) continue;
      const stat = await fs.stat(join(dir, name));
      items.push({ name, kind: match[1] as BackupKind, size: stat.size, createdAt: stat.mtime.toISOString() });
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
  }

  status() {
    return {
      running: this.running,
      lastSuccess: this.lastSuccess?.toISOString() ?? null,
      lastError: this.lastError ? { message: this.lastError.message, at: this.lastError.at.toISOString() } : null,
      directory: backupDir(),
      keep: KEEP,
      checkedEveryHours: CHECK_EVERY_MS / 3_600_000,
      maxAgeHours: MAX_AGE_MS / 3_600_000,
    };
  }

  // ---- Creating ----

  /**
   * Back up now. Throws if a backup is already running or if this one fails
   * (the failure is also recorded in status()). The partly written file is
   * always removed, so a failed backup never looks like a good one.
   */
  async create(kind: BackupKind = 'manual'): Promise<BackupInfo> {
    if (this.running) throw new Error('A backup is already running');
    this.running = true;

    const dir = backupDir();
    const name = `crm-${kind}-${stamp(new Date())}.db`;
    const target = join(dir, name);
    const partial = `${target}.partial`;

    try {
      await fs.mkdir(dir, { recursive: true });
      await this.prisma.$executeRawUnsafe(`VACUUM INTO '${partial.replace(/'/g, "''")}'`);
      await this.verifyFile(partial);
      await fs.rename(partial, target);
      this.lastSuccess = new Date();
      this.lastError = null;
      await this.prune().catch((err) => this.logger.warn(`Could not prune old backups: ${this.messageOf(err)}`));

      const stat = await fs.stat(target);
      this.logger.log(`Backup created: ${name} (${stat.size} bytes)`);
      return { name, kind, size: stat.size, createdAt: stat.mtime.toISOString() };
    } catch (err) {
      await fs.rm(partial, { force: true }).catch(() => undefined);
      this.lastError = { message: this.messageOf(err), at: new Date() };
      throw err;
    } finally {
      this.running = false;
    }
  }

  /**
   * Open the copy as its own database, check it is sound, and check it has the
   * same tables as the live one. Throws if anything is wrong.
   */
  async verifyFile(file: string): Promise<void> {
    const client = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, '/')}` } } });
    try {
      const rows = await client.$queryRawUnsafe<Record<string, string>[]>('PRAGMA integrity_check');
      const result = rows.map((r) => Object.values(r)[0]).join('; ');
      if (result !== 'ok') throw new Error(`Backup failed its integrity check: ${result}`);

      const countTables = (db: { $queryRawUnsafe: PrismaClient['$queryRawUnsafe'] }) =>
        db
          .$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'`)
          .then((r) => Number(r[0].n));
      const [copy, live] = await Promise.all([countTables(client), countTables(this.prisma)]);
      if (copy !== live) throw new Error(`Backup has ${copy} tables but the database has ${live}`);
    } finally {
      await client.$disconnect();
    }
  }

  /** Delete the oldest backups of each kind beyond the keep limits. */
  async prune(): Promise<string[]> {
    const all = await this.list();
    const removed: string[] = [];
    for (const kind of Object.keys(KEEP) as BackupKind[]) {
      const extra = all.filter((b) => b.kind === kind).slice(KEEP[kind]);
      for (const b of extra) {
        await fs.rm(join(backupDir(), b.name), { force: true });
        removed.push(b.name);
      }
    }
    return removed;
  }

  private messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
