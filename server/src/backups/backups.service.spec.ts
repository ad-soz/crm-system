import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BackupsService, KEEP, MAX_AGE_MS } from './backups.service';

describe('BackupsService', () => {
  let dir: string;
  let prisma: any;
  let service: BackupsService;

  // Simulates VACUUM INTO by writing a small file at the target path.
  const fakeVacuum = async (sql: string) => {
    const target = /VACUUM INTO '(.*)'/.exec(sql)![1].replace(/''/g, "'");
    await fs.writeFile(target, 'sqlite-data');
    return 0;
  };

  const put = async (name: string, ageMs = 0) => {
    const file = join(dir, name);
    await fs.writeFile(file, 'x');
    const when = new Date(Date.now() - ageMs);
    await fs.utimes(file, when, when);
  };

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'crm-backups-'));
    process.env.CRM_BACKUP_DIR = dir;
    prisma = { $executeRawUnsafe: jest.fn(fakeVacuum) };
    service = new BackupsService(prisma);
    jest.spyOn(service, 'verifyFile').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    delete process.env.CRM_BACKUP_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('lists only recognised backup files, newest first', async () => {
    await put('crm-auto-20261101-010000-000.db', 3 * 86_400_000);
    await put('crm-manual-20261105-010000-000.db', 1 * 86_400_000);
    await put('notes.txt');
    await put('crm-auto-20261108-010000-000.db.partial');
    const list = await service.list();
    expect(list.map((b) => b.name)).toEqual([
      'crm-manual-20261105-010000-000.db',
      'crm-auto-20261101-010000-000.db',
    ]);
    expect(list[0].kind).toBe('manual');
  });

  it('returns an empty list when the folder does not exist yet', async () => {
    await fs.rm(dir, { recursive: true, force: true });
    expect(await service.list()).toEqual([]);
  });

  it('creates a verified backup and removes the temporary file', async () => {
    const info = await service.create('manual');
    expect(info.kind).toBe('manual');
    expect(info.size).toBeGreaterThan(0);
    const files = await fs.readdir(dir);
    expect(files).toEqual([info.name]);
    expect(service.verifyFile).toHaveBeenCalledTimes(1);
    expect(service.status().lastSuccess).not.toBeNull();
    expect(service.status().lastError).toBeNull();
  });

  it('discards a backup that fails verification and records the error', async () => {
    (service.verifyFile as jest.Mock).mockRejectedValue(new Error('Backup failed its integrity check: bad page'));
    await expect(service.create('manual')).rejects.toThrow(/integrity check/);
    expect(await fs.readdir(dir)).toEqual([]);
    expect(service.status().lastError?.message).toMatch(/integrity check/);
  });

  it('refuses to run two backups at once', async () => {
    let release: (() => void) | undefined;
    prisma.$executeRawUnsafe.mockImplementationOnce(
      (sql: string) => new Promise((resolve) => (release = () => resolve(fakeVacuum(sql)))),
    );
    const first = service.create('manual');
    // Wait until the first backup is genuinely in progress (it creates the folder first).
    for (let i = 0; i < 200 && !release; i++) await new Promise((r) => setTimeout(r, 5));
    expect(release).toBeDefined();
    await expect(service.create('manual')).rejects.toThrow(/already running/);
    release!();
    await first;
  });

  it('keeps only the newest backups of each kind', async () => {
    for (let i = 0; i < KEEP.auto + 3; i++) {
      await put(`crm-auto-202610${String(i + 1).padStart(2, '0')}-010000-000.db`, (40 - i) * 86_400_000);
    }
    await put('crm-manual-20261001-010000-000.db', 60 * 86_400_000);
    const removed = await service.prune();
    expect(removed).toHaveLength(3);
    const left = await service.list();
    expect(left.filter((b) => b.kind === 'auto')).toHaveLength(KEEP.auto);
    // A different kind is never pushed out by automatic ones.
    expect(left.filter((b) => b.kind === 'manual')).toHaveLength(1);
  });

  describe('runIfDue', () => {
    it('makes a backup when there is none', async () => {
      const info = await service.runIfDue();
      expect(info?.kind).toBe('auto');
    });

    it('does nothing when the newest backup is under 24 hours old', async () => {
      await put('crm-auto-20261108-010000-000.db', MAX_AGE_MS - 60_000);
      expect(await service.runIfDue()).toBeNull();
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('makes a backup when the newest is over 24 hours old', async () => {
      await put('crm-auto-20261106-010000-000.db', MAX_AGE_MS + 60_000);
      expect((await service.runIfDue())?.kind).toBe('auto');
    });

    it('counts a manual backup as recent, but not a pre-update safety copy', async () => {
      await put('crm-manual-20261108-010000-000.db', 60_000);
      expect(await service.runIfDue()).toBeNull();

      await fs.rm(join(dir, 'crm-manual-20261108-010000-000.db'));
      await put('crm-pre-update-20261108-010000-000.db', 60_000);
      expect((await service.runIfDue())?.kind).toBe('auto');
    });

    it('never throws, so a failing backup cannot take the app down', async () => {
      prisma.$executeRawUnsafe.mockRejectedValue(new Error('disk full'));
      await expect(service.runIfDue()).resolves.toBeNull();
      expect(service.status().lastError?.message).toBe('disk full');
    });
  });

  it('quotes the path safely in the SQL it runs', async () => {
    const quirky = join(dir, "it's");
    process.env.CRM_BACKUP_DIR = quirky;
    await service.create('manual');
    const sql: string = prisma.$executeRawUnsafe.mock.calls[0][0];
    expect(sql).toContain("it''s");
    await fs.rm(quirky, { recursive: true, force: true });
  });
});
