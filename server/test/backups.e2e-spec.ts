import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Backups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let rep: TestUser;
  let dir: string;

  beforeAll(async () => {
    // Never write test backups into the real backup folder.
    dir = await fs.mkdtemp(join(tmpdir(), 'crm-e2e-backups-'));
    process.env.CRM_BACKUP_DIR = dir;
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    rep = await createTestUser(app, prisma, 'SALES_REP');
  });

  afterAll(async () => {
    await deleteTestUsers(prisma, [admin, rep]);
    await app.close();
    delete process.env.CRM_BACKUP_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('keeps backups away from people without the permission', async () => {
    await request(app.getHttpServer()).get('/api/backups').set(bearer(rep)).expect(403);
    await request(app.getHttpServer()).post('/api/backups').set(bearer(rep)).expect(403);
    await request(app.getHttpServer()).get('/api/backups').expect(401);
  });

  it('starts with no backups and a status the screen can show', async () => {
    const res = await request(app.getHttpServer()).get('/api/backups').set(bearer(admin)).expect(200);
    expect(res.body.backups).toEqual([]);
    expect(res.body.status.directory).toBe(dir);
    expect(res.body.status.lastError).toBeNull();
  });

  it('makes a backup that really contains the data and passes its own check', async () => {
    const created = await request(app.getHttpServer()).post('/api/backups').set(bearer(admin)).expect(201);
    expect(created.body.kind).toBe('manual');
    expect(created.body.size).toBeGreaterThan(0);

    const list = await request(app.getHttpServer()).get('/api/backups').set(bearer(admin)).expect(200);
    expect(list.body.backups.map((b: any) => b.name)).toEqual([created.body.name]);
    expect(list.body.status.lastSuccess).not.toBeNull();

    // Open the backup as a separate database and compare it with the live one.
    const copy = new PrismaClient({ datasources: { db: { url: `file:${join(dir, created.body.name).replace(/\\/g, '/')}` } } });
    try {
      const [liveUsers, copyUsers] = await Promise.all([prisma.user.count(), copy.user.count()]);
      expect(copyUsers).toBe(liveUsers);
      expect(await copy.dealStage.count()).toBe(await prisma.dealStage.count());
      expect(await copy.company.count()).toBe(await prisma.company.count());
      const rows = await copy.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check');
      expect(rows[0].integrity_check).toBe('ok');
    } finally {
      await copy.$disconnect();
    }
  });

  it('leaves no half-written files behind', async () => {
    const files = await fs.readdir(dir);
    expect(files.every((f) => /^crm-manual-.*\.db$/.test(f))).toBe(true);
  });
});
