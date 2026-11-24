import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let audit: any;

  const baseUser = (passwordHash: string) => ({
    id: 'user-1',
    email: 'test@test.com',
    passwordHash,
    firstName: 'Test',
    lastName: 'User',
    roleProfileId: 'sales-rep',
    roleProfile: {
      id: 'sales-rep',
      name: 'Sales Rep',
      description: null,
      permissions: '["people.view"]',
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    mustChangePassword: true,
    passwordChangedAt: null,
    themePrefs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    audit = { event: jest.fn(), failedSignInAllowed: jest.fn().mockResolvedValue(true) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('mock-token') } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns a token and the user without the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('password123', 4)));
      const result = await service.login({ email: 'test@test.com', password: 'password123' });
      expect(result.accessToken).toBe('mock-token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.mustChangePassword).toBe(true);
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@test.com', password: 'p' })).rejects.toThrow('Invalid credentials');
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('password123', 4)));
      await expect(service.login({ email: 'test@test.com', password: 'nope' })).rejects.toThrow(UnauthorizedException);
    });

    it('records a sign-in against the user', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('password123', 4)));
      await service.login({ email: 'test@test.com', password: 'password123' });
      expect(audit.event).toHaveBeenCalledWith('sign_in', { actorId: 'user-1', entity: 'session', recordId: 'user-1' });
    });

    it('records a failed sign-in with the address tried and never the password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('password123', 4)));
      await expect(service.login({ email: 'test@test.com', password: 'my-secret-guess' })).rejects.toThrow(UnauthorizedException);
      expect(audit.event).toHaveBeenCalledTimes(1);
      expect(audit.event.mock.calls[0][0]).toBe('sign_in_failed');
      expect(JSON.stringify(audit.event.mock.calls)).not.toContain('my-secret-guess');
      expect(audit.event.mock.calls[0][1].detail).toContain('test@test.com');
    });

    it('stops recording failed sign-ins during a flood, but still refuses them', async () => {
      audit.failedSignInAllowed.mockResolvedValue(false);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@test.com', password: 'p' })).rejects.toThrow(UnauthorizedException);
      expect(audit.event).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('stores a new hash, clears the forced-change flag, and issues a new token', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('Temp-pass-1234', 4)));
      prisma.user.update.mockImplementation(async ({ data }: any) => ({ ...baseUser(data.passwordHash), ...data }));

      const result = await service.changePassword('user-1', 'Temp-pass-1234', 'My-new-password-99');

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(await bcrypt.compare('My-new-password-99', data.passwordHash)).toBe(true);
      expect(data.mustChangePassword).toBe(false);
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
      expect(result.accessToken).toBe('mock-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects an incorrect current password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('Temp-pass-1234', 4)));
      await expect(service.changePassword('user-1', 'wrong', 'My-new-password-99')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser(await bcrypt.hash('Same-pass-1234', 4)));
      await expect(service.changePassword('user-1', 'Same-pass-1234', 'Same-pass-1234')).rejects.toThrow(
        /different/,
      );
    });
  });
});
