import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { ALL_PERMISSIONS, SALES_REP_PERMISSIONS } from '../permissions/permissions';

const adminProfile = { id: 'administrator', name: 'Administrator', permissions: '[]', isSystem: true };
const repProfile = { id: 'sales-rep', name: 'Sales Rep', permissions: JSON.stringify(SALES_REP_PERMISSIONS), isSystem: false };
const managerProfile = {
  id: 'manager',
  name: 'Team manager',
  permissions: JSON.stringify([...SALES_REP_PERMISSIONS, 'users.manage']),
  isSystem: false,
};

const admin = { id: 'admin-1', roleProfile: { id: 'administrator' }, permissions: [...ALL_PERMISSIONS] };
const manager = {
  id: 'manager-1',
  roleProfile: { id: 'manager' },
  permissions: [...SALES_REP_PERMISSIONS, 'users.manage'],
};

describe('UsersService', () => {
  let prisma: any;
  let service: UsersService;
  const profiles: Record<string, any> = { administrator: adminProfile, 'sales-rep': repProfile, manager: managerProfile };
  const users: Record<string, any> = {
    'admin-1': { id: 'admin-1', roleProfileId: 'administrator', roleProfile: adminProfile },
    'admin-2': { id: 'admin-2', roleProfileId: 'administrator', roleProfile: adminProfile },
    'rep-1': { id: 'rep-1', roleProfileId: 'sales-rep', roleProfile: repProfile },
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => (where.id ? (users[where.id] ?? null) : null)),
        create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
        update: jest.fn(async ({ data }: any) => data),
        count: jest.fn(async () => 2),
      },
      roleProfile: { findUnique: jest.fn(async ({ where }: any) => profiles[where.id] ?? null) },
    };
    service = new UsersService(prisma);
  });

  describe('invite', () => {
    it('creates the account with a hashed temporary password and the chosen profile', async () => {
      const { temporaryPassword } = await service.invite(
        { email: ' New.Person@Example.com ', firstName: 'New', lastName: 'Person', roleProfileId: 'sales-rep' },
        admin,
      );
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.email).toBe('new.person@example.com');
      expect(data.roleProfileId).toBe('sales-rep');
      expect(data.mustChangePassword).toBe(true);
      expect(await bcrypt.compare(temporaryPassword, data.passwordHash)).toBe(true);
    });

    it('refuses a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.invite({ email: 'a@b.com', firstName: 'A', lastName: 'B', roleProfileId: 'sales-rep' }, admin),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses an unknown profile', async () => {
      await expect(
        service.invite({ email: 'a@b.com', firstName: 'A', lastName: 'B', roleProfileId: 'nope' }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('stops a user manager from creating an Administrator', async () => {
      await expect(
        service.invite({ email: 'a@b.com', firstName: 'A', lastName: 'B', roleProfileId: 'administrator' }, manager),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('assignProfile', () => {
    it('changes a profile', async () => {
      await service.assignProfile('rep-1', 'manager', admin);
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ roleProfileId: 'manager' });
    });

    it("won't let you change your own profile", async () => {
      await expect(service.assignProfile('admin-1', 'sales-rep', admin)).rejects.toThrow(/your own/);
    });

    it('keeps at least one Administrator', async () => {
      prisma.user.count.mockResolvedValue(1);
      await expect(service.assignProfile('admin-2', 'sales-rep', admin)).rejects.toThrow(/at least one Administrator/);
    });

    it('stops a user manager from changing an Administrator or promoting someone', async () => {
      await expect(service.assignProfile('admin-2', 'sales-rep', manager)).rejects.toThrow(ForbiddenException);
      await expect(service.assignProfile('rep-1', 'administrator', manager)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resetPassword', () => {
    it('sets a new temporary password and ends existing sessions', async () => {
      const { temporaryPassword } = await service.resetPassword('rep-1', admin);
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(await bcrypt.compare(temporaryPassword, data.passwordHash)).toBe(true);
      expect(data.mustChangePassword).toBe(true);
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('does not reset your own password this way', async () => {
      await expect(service.resetPassword('admin-1', admin)).rejects.toThrow(BadRequestException);
    });

    it('stops a user manager from taking over an Administrator account', async () => {
      await expect(service.resetPassword('admin-2', manager)).rejects.toThrow(ForbiddenException);
    });

    it('reports a missing user', async () => {
      await expect(service.resetPassword('missing', admin)).rejects.toThrow(NotFoundException);
    });
  });
});
