import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, createTestUser, deleteTestUsers, TestUser } from './helpers';

describe('Role profiles and permissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  const users: TestUser[] = [];
  const profileIds: string[] = [];

  const server = () => app.getHttpServer();

  async function makeProfile(name: string, permissions: string[]) {
    const res = await request(server())
      .post('/api/role-profiles')
      .set(bearer(admin))
      .send({ name: `${name} ${Date.now()}`, permissions })
      .expect(201);
    profileIds.push(res.body.id);
    return res.body;
  }

  async function userOn(profileId: string) {
    const user = await createTestUser(app, prisma, profileId);
    users.push(user);
    return user;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await createTestUser(app, prisma, 'ADMIN');
  });

  afterAll(async () => {
    await deleteTestUsers(prisma, [...users, admin]);
    await prisma.roleProfile.deleteMany({ where: { id: { in: profileIds } } });
    await app.close();
  });

  it('exposes the permission catalog and lists the built-in profiles', async () => {
    const catalog = await request(server()).get('/api/role-profiles/catalog').set(bearer(admin)).expect(200);
    expect(catalog.body.areas.map((a: any) => a.key)).toEqual(['people', 'companies', 'deals', 'contacts', 'tasks']);
    const list = await request(server()).get('/api/role-profiles').set(bearer(admin)).expect(200);
    const names = list.body.map((p: any) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Administrator', 'Sales Rep']));
  });

  it('enforces view, create, edit, and delete separately', async () => {
    const viewer = await makeProfile('Person viewers', ['people.view']);
    expect(viewer.permissions).toEqual(['people.view']);
    const user = await userOn(viewer.id);

    const me = await request(server()).get('/api/auth/me').set(bearer(user)).expect(200);
    expect(me.body.permissions).toEqual(['people.view']);
    expect(me.body.roleProfile.id).toBe(viewer.id);

    await request(server()).get('/api/people').set(bearer(user)).expect(200);
    await request(server()).post('/api/people').set(bearer(user)).send({ firstName: 'A', lastName: 'B' }).expect(403);
    await request(server()).get('/api/deals').set(bearer(user)).expect(403);
    await request(server()).get('/api/companies').set(bearer(user)).expect(403);
    await request(server()).get('/api/export/people').set(bearer(user)).expect(403);
    await request(server()).get('/api/schema/erd').set(bearer(user)).expect(403);

    const dash = await request(server()).get('/api/dashboard').set(bearer(user)).expect(200);
    expect(typeof dash.body.totalPeople).toBe('number');
    expect(dash.body.openDeals).toBeNull();
    expect(dash.body.upcomingTasks).toBeNull();
  });

  it('applies profile changes immediately, without signing in again', async () => {
    const profile = await makeProfile('Growing', ['people.view']);
    const user = await userOn(profile.id);
    await request(server()).get('/api/deals').set(bearer(user)).expect(403);

    await request(server())
      .patch(`/api/role-profiles/${profile.id}`)
      .set(bearer(admin))
      .send({ permissions: ['people.view', 'deals.view'] })
      .expect(200);
    await request(server()).get('/api/deals').set(bearer(user)).expect(200);
  });

  it('stops a user manager from escalating their own or anyone else’s access', async () => {
    const managers = await makeProfile('User managers', ['people.view', 'users.manage']);
    const manager = await userOn(managers.id);
    const target = await userOn('SALES_REP');

    // Can see profiles (to pick one when inviting) but not change them.
    await request(server()).get('/api/role-profiles').set(bearer(manager)).expect(200);
    await request(server())
      .post('/api/role-profiles')
      .set(bearer(manager))
      .send({ name: 'Mine', permissions: ['users.manage'] })
      .expect(403);

    // Can't hand out more than they have, or take over a stronger account.
    await request(server())
      .post('/api/users')
      .set(bearer(manager))
      .send({ email: `esc-${Date.now()}@test.local`, firstName: 'E', lastName: 'Sc', roleProfileId: 'administrator' })
      .expect(403);
    await request(server())
      .patch(`/api/users/${target.id}/profile`)
      .set(bearer(manager))
      .send({ roleProfileId: 'administrator' })
      .expect(403);
    await request(server()).post(`/api/users/${admin.id}/reset-password`).set(bearer(manager)).expect(403);
    await request(server())
      .patch(`/api/users/${manager.id}/profile`)
      .set(bearer(manager))
      .send({ roleProfileId: 'administrator' })
      .expect(400);
  });

  it('keeps Administrator locked and refuses to delete a profile in use', async () => {
    await request(server())
      .patch('/api/role-profiles/administrator')
      .set(bearer(admin))
      .send({ permissions: [] })
      .expect(403);
    await request(server()).delete('/api/role-profiles/administrator').set(bearer(admin)).expect(403);

    const inUse = await makeProfile('In use', ['tasks.view']);
    await userOn(inUse.id);
    await request(server()).delete(`/api/role-profiles/${inUse.id}`).set(bearer(admin)).expect(409);

    const unused = await makeProfile('Unused', []);
    await request(server()).delete(`/api/role-profiles/${unused.id}`).set(bearer(admin)).expect(200);
  });

  it('rejects unknown permissions and duplicate names', async () => {
    await request(server())
      .post('/api/role-profiles')
      .set(bearer(admin))
      .send({ name: 'Bad', permissions: ['everything.ever'] })
      .expect(400);
    await request(server())
      .post('/api/role-profiles')
      .set(bearer(admin))
      .send({ name: 'sales rep', permissions: [] })
      .expect(409);
  });
});
