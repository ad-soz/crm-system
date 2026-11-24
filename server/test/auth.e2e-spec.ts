import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const created: TestUser[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await deleteTestUsers(prisma, created);
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('has no public sign-up', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({ email: 'x@test.local', password: 'password123', firstName: 'X', lastName: 'Y' })
      .expect(404);
  });

  it('signs in and returns the profile without the password hash', async () => {
    const user = await createTestUser(app, prisma, 'SALES_REP');
    created.push(user);
    expect(user.token).toBeDefined();

    const me = await request(server()).get('/api/auth/me').set(bearer(user)).expect(200);
    expect(me.body.email).toBe(user.email);
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('rejects bad credentials, missing tokens, and forged tokens', async () => {
    const user = await createTestUser(app, prisma, 'SALES_REP');
    created.push(user);
    await request(server()).post('/api/auth/login').send({ email: user.email, password: 'wrong' }).expect(401);
    await request(server()).get('/api/auth/me').expect(401);
    await request(server()).get('/api/auth/me').set('Authorization', 'Bearer not-a-token').expect(401);

    // A token signed with the old placeholder secret must not work.
    const jwt = require('@nestjs/jwt');
    const forged = new jwt.JwtService({ secret: 'crm-super-secret-jwt-key-change-in-production' }).sign({
      sub: user.id,
      email: user.email,
      pwd: 0,
    });
    await request(server()).get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('blocks someone with a temporary password until they change it', async () => {
    const user = await createTestUser(app, prisma, 'SALES_REP', { mustChangePassword: true });
    created.push(user);

    const blocked = await request(server()).get('/api/people').set(bearer(user)).expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Allowed while pending: profile and own theme.
    const me = await request(server()).get('/api/auth/me').set(bearer(user)).expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    await request(server()).get('/api/appearance/me').set(bearer(user)).expect(200);

    const changed = await request(server())
      .post('/api/auth/change-password')
      .set(bearer(user))
      .send({ currentPassword: user.password, newPassword: 'A-brand-new-password-1' })
      .expect(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // The new token works for everything; the old one has been ended.
    await request(server()).get('/api/people').set(bearer({ token: changed.body.accessToken })).expect(200);
    await request(server()).get('/api/auth/me').set(bearer(user)).expect(401);

    // The new password signs in; the old one doesn't.
    await request(server())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'A-brand-new-password-1' })
      .expect(201);
    await request(server()).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(401);
  });

  it('validates password changes', async () => {
    const user = await createTestUser(app, prisma, 'SALES_REP');
    created.push(user);
    await request(server())
      .post('/api/auth/change-password')
      .set(bearer(user))
      .send({ currentPassword: user.password, newPassword: 'short' })
      .expect(400);
    await request(server())
      .post('/api/auth/change-password')
      .set(bearer(user))
      .send({ currentPassword: 'wrong-password', newPassword: 'A-long-enough-password' })
      .expect(400);
  });
});
