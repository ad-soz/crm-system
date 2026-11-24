import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ADMINISTRATOR_PROFILE_ID, SALES_REP_PROFILE_ID } from '../src/permissions/permissions';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

// Tests use throwaway accounts instead of shared ones, so they don't depend on
// (or reveal) anyone's real password. Call deleteTestUsers in afterAll.
/**
 * Create a throwaway account directly in the database and sign it in.
 * `profile` is 'ADMIN' (Administrator), 'SALES_REP' (Sales Rep), or the id
 * of any role profile.
 */
export async function createTestUser(
  app: INestApplication,
  prisma: PrismaService,
  profile: 'ADMIN' | 'SALES_REP' | string,
  options: { mustChangePassword?: boolean } = {},
): Promise<TestUser> {
  const roleProfileId =
    profile === 'ADMIN' ? ADMINISTRATOR_PROFILE_ID : profile === 'SALES_REP' ? SALES_REP_PROFILE_ID : profile;
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = `E2e-${Math.random().toString(36).slice(2)}-pass`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 4),
      firstName: 'E2E',
      lastName: profile === 'ADMIN' ? 'Admin' : 'User',
      roleProfileId,
      mustChangePassword: options.mustChangePassword ?? false,
    },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
  return { id: user.id, email, password, token: res.body.accessToken };
}

export async function deleteTestUsers(prisma: PrismaService, users: { id: string }[]) {
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

export const bearer = (user: { token: string }) => ({ Authorization: `Bearer ${user.token}` });
