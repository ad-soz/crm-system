import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Appearance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let rep: TestUser;
  let adminToken: string;
  let repToken: string;
  let previousOrg: string | null = null;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    // Preserve whatever org theme exists so the test leaves the DB as it found it.
    const existing = await prisma.appSetting.findUnique({ where: { key: 'theme' } });
    previousOrg = existing?.value ?? null;

    admin = await createTestUser(app, prisma, 'ADMIN');
    rep = await createTestUser(app, prisma, 'SALES_REP');
    adminToken = admin.token;
    repToken = rep.token;
  });

  afterAll(async () => {
    if (previousOrg === null) {
      await prisma.appSetting.deleteMany({ where: { key: 'theme' } });
    } else {
      await prisma.appSetting.update({ where: { key: 'theme' }, data: { value: previousOrg } });
    }
    await deleteTestUsers(prisma, [admin, rep]);
    await app.close();
  });

  it('lets an admin set the org theme', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/appearance/org')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'dark', preset: 'violet', radius: 0.75 })
      .expect(200);
    expect(res.body.theme).toEqual({ mode: 'dark', preset: 'violet', radius: 0.75 });
  });

  it('serves the org theme without authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/appearance/org').expect(200);
    expect(res.body.theme.preset).toBe('violet');
  });

  it('forbids a sales rep from changing the org theme', async () => {
    await request(app.getHttpServer())
      .put('/api/appearance/org')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ mode: 'light' })
      .expect(403);
  });

  it('lets any user save and clear their own theme', async () => {
    await request(app.getHttpServer())
      .put('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ font: 'serif', fontSize: 'lg', primary: '#2563eb' })
      .expect(200);

    const mine = await request(app.getHttpServer())
      .get('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);
    expect(mine.body.theme).toEqual({ font: 'serif', fontSize: 'lg', primary: '#2563eb' });

    await request(app.getHttpServer())
      .delete('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);

    const cleared = await request(app.getHttpServer())
      .get('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);
    expect(cleared.body.theme).toBeNull();
  });

  it('rejects invalid values', async () => {
    await request(app.getHttpServer())
      .put('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ primary: 'red' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ font: 'comic-sans' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ unknownKey: true })
      .expect(400);
  });

  it('saves each glow level and rejects unknown ones', async () => {
    for (const glow of ['none', 'light', 'medium', 'full', 'too-much']) {
      const res = await request(app.getHttpServer())
        .put('/api/appearance/me')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ glow })
        .expect(200);
      expect(res.body.theme).toEqual({ glow });
    }

    await request(app.getHttpServer())
      .put('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ glow: 'blinding' })
      .expect(400);

    await request(app.getHttpServer())
      .delete('/api/appearance/me')
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);
  });

  it('requires authentication for personal settings', async () => {
    await request(app.getHttpServer()).get('/api/appearance/me').expect(401);
  });
});
