import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PeopleService } from './people.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PeopleService', () => {
  let service: PeopleService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      person: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      company: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PeopleService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PeopleService);
  });

  it('should create a person linked to a company', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'co1' });
    prisma.person.create.mockResolvedValue({ id: '1', firstName: 'Alice' });
    const result = await service.create(
      { firstName: 'Alice', lastName: 'Johnson', companyId: 'co1' },
      'user-1',
    );
    expect(result.firstName).toBe('Alice');
  });

  it('should default owner to the current user', async () => {
    prisma.person.create.mockResolvedValue({ id: '1' });
    await service.create({ firstName: 'Bob', lastName: 'Smith' }, 'user-1');
    const callArg = prisma.person.create.mock.calls[0][0];
    expect(callArg.data.ownerId).toBe('user-1');
  });

  it('should reject a person referencing a missing company', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ firstName: 'A', lastName: 'B', companyId: 'missing' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should filter people by company', async () => {
    prisma.person.findMany.mockResolvedValue([]);
    prisma.person.count.mockResolvedValue(0);
    await service.findAll(1, 20, undefined, 'co1');
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'co1' } }),
    );
  });

  it('should throw 404 for a missing person', async () => {
    prisma.person.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('should delete a person', async () => {
    prisma.person.findUnique.mockResolvedValue({ id: '1' });
    prisma.person.delete.mockResolvedValue({});
    const result = await service.remove('1');
    expect(result.success).toBe(true);
  });
});
