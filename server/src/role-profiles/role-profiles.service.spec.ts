import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RoleProfilesService } from './role-profiles.service';
import { ALL_PERMISSIONS, SALES_REP_PERMISSIONS } from '../permissions/permissions';

const admin = { id: 'a', roleProfile: { id: 'administrator' }, permissions: [...ALL_PERMISSIONS] };
const profileManager = {
  id: 'p',
  roleProfile: { id: 'profile-admins' },
  permissions: ['people.view', 'profiles.manage'],
};

describe('RoleProfilesService', () => {
  let prisma: any;
  let service: RoleProfilesService;
  const stored: Record<string, any> = {
    administrator: { id: 'administrator', name: 'Administrator', permissions: '[]', isSystem: true },
    'sales-rep': { id: 'sales-rep', name: 'Sales Rep', permissions: JSON.stringify(SALES_REP_PERMISSIONS), isSystem: false },
    'profile-admins': { id: 'profile-admins', name: 'Profile admins', permissions: '["people.view","profiles.manage"]', isSystem: false },
  };

  beforeEach(() => {
    prisma = {
      roleProfile: {
        findUnique: jest.fn(async ({ where }: any) => stored[where.id] ?? null),
        findMany: jest.fn(async () => Object.values(stored)),
        create: jest.fn(async ({ data }: any) => ({ id: 'new', isSystem: false, ...data })),
        update: jest.fn(async ({ where, data }: any) => ({ ...stored[where.id], ...data, _count: { users: 0 } })),
        delete: jest.fn(async () => ({})),
      },
      user: { count: jest.fn(async () => 0) },
    };
    service = new RoleProfilesService(prisma);
  });

  it('creates a profile and fills in implied view permissions', async () => {
    const created = await service.create({ name: ' Viewers ', permissions: ['deals.edit'] }, admin);
    const data = prisma.roleProfile.create.mock.calls[0][0].data;
    expect(data.name).toBe('Viewers');
    expect(JSON.parse(data.permissions)).toEqual(['deals.view', 'deals.edit']);
    expect(created.permissions).toEqual(['deals.view', 'deals.edit']);
  });

  it('rejects unknown permissions and duplicate names (ignoring case)', async () => {
    await expect(service.create({ name: 'X', permissions: ['launch.missiles'] }, admin)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.create({ name: 'sales rep', permissions: [] }, admin)).rejects.toThrow(ConflictException);
  });

  it("won't create or edit a profile with permissions you don't have", async () => {
    await expect(
      service.create({ name: 'Sneaky', permissions: ['users.manage'] }, profileManager),
    ).rejects.toThrow(ForbiddenException);
    // Sales Rep includes access the profile manager lacks, so they can't edit it either.
    await expect(service.update('sales-rep', { name: 'Reps' }, profileManager)).rejects.toThrow(ForbiddenException);
  });

  it('keeps the Administrator profile locked', async () => {
    await expect(service.update('administrator', { name: 'Root' }, admin)).rejects.toThrow(/can't be changed/);
    await expect(service.remove('administrator')).rejects.toThrow(/can't be deleted/);
  });

  it("won't let you edit the profile you're using", async () => {
    await expect(service.update('profile-admins', { permissions: [] }, profileManager)).rejects.toThrow(
      /you're using/,
    );
  });

  it("won't delete a profile that people still use", async () => {
    prisma.user.count.mockResolvedValue(3);
    await expect(service.remove('sales-rep')).rejects.toThrow(/3 people use this profile/);
    expect(prisma.roleProfile.delete).not.toHaveBeenCalled();
  });

  it('reports every permission for Administrator in the list', async () => {
    prisma.roleProfile.findMany.mockResolvedValue([{ ...stored.administrator, _count: { users: 1 } }]);
    const [view] = await service.list();
    expect(view.permissions).toEqual(ALL_PERMISSIONS);
    expect(view.userCount).toBe(1);
  });
});
