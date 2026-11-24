import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let rep: TestUser;
  const invitedEmails: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
    rep = await createTestUser(app, prisma, 'SALES_REP');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: invitedEmails } } });
    await deleteTestUsers(prisma, [admin, rep]);
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('admin can list users', async () => {
    const res = await request(server()).get('/api/users').set(bearer(admin)).expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0]).not.toHaveProperty('passwordHash');
  });

  it('sales rep cannot list, invite, or reset', async () => {
    await request(server()).get('/api/users').set(bearer(rep)).expect(403);
    await request(server())
      .post('/api/users')
      .set(bearer(rep))
      .send({ email: 'nope@test.local', firstName: 'N', lastName: 'O', roleProfileId: 'administrator' })
      .expect(403);
    await request(server()).post(`/api/users/${admin.id}/reset-password`).set(bearer(rep)).expect(403);
  });

  it('admin can invite someone, who must then set their own password', async () => {
    const email = `e2e-invite-${Date.now()}@test.local`;
    invitedEmails.push(email);
    const res = await request(server())
      .post('/api/users')
      .set(bearer(admin))
      .send({ email, firstName: 'Invited', lastName: 'Person', roleProfileId: 'sales-rep' })
      .expect(201);
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(res.body.user.roleProfile.name).toBe('Sales Rep');
    expect(res.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);

    const login = await request(server())
      .post('/api/auth/login')
      .send({ email, password: res.body.temporaryPassword })
      .expect(201);
    const blocked = await request(server()).get('/api/deals').set(bearer({ token: login.body.accessToken })).expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Inviting the same email again is refused.
    await request(server())
      .post('/api/users')
      .set(bearer(admin))
      .send({ email, firstName: 'Again', lastName: 'Person', roleProfileId: 'sales-rep' })
      .expect(409);
  });

  it('admin can reset a password, which signs that person out', async () => {
    const target = await createTestUser(app, prisma, 'SALES_REP');
    try {
      const res = await request(server()).post(`/api/users/${target.id}/reset-password`).set(bearer(admin)).expect(200);
      await request(server()).get('/api/auth/me').set(bearer(target)).expect(401);
      await request(server())
        .post('/api/auth/login')
        .send({ email: target.email, password: res.body.temporaryPassword })
        .expect(201);
    } finally {
      await deleteTestUsers(prisma, [target]);
    }
  });

  it('admin cannot reset their own password from user management', async () => {
    await request(server()).post(`/api/users/${admin.id}/reset-password`).set(bearer(admin)).expect(400);
  });

  it('admin can change a profile and users can edit their own details', async () => {
    const promoted = await request(server())
      .patch(`/api/users/${rep.id}/profile`)
      .set(bearer(admin))
      .send({ roleProfileId: 'administrator' })
      .expect(200);
    expect(promoted.body.roleProfile.id).toBe('administrator');
    await request(server())
      .patch(`/api/users/${rep.id}/profile`)
      .set(bearer(admin))
      .send({ roleProfileId: 'sales-rep' })
      .expect(200);
    await request(server())
      .patch(`/api/users/${admin.id}/profile`)
      .set(bearer(admin))
      .send({ roleProfileId: 'sales-rep' })
      .expect(400);

    const res = await request(server()).patch(`/api/users/${rep.id}`).set(bearer(rep)).send({ firstName: 'Johnny' }).expect(200);
    expect(res.body.firstName).toBe('Johnny');
    await request(server()).patch(`/api/users/${admin.id}`).set(bearer(rep)).send({ firstName: 'X' }).expect(403);
  });
});
