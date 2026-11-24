import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      companyIndustry: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      person: { count: jest.fn() },
      deal: { count: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CompaniesService);
  });

  it('should create a company', async () => {
    prisma.company.create.mockResolvedValue({ id: '1', name: 'Acme', industries: [] });
    const result = await service.create({ name: 'Acme' });
    expect(result.name).toBe('Acme');
    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Acme', industries: undefined },
        include: expect.objectContaining({ industries: { include: { industry: true } } }),
      }),
    );
  });

  it('should create a company with industries as join rows', async () => {
    prisma.company.create.mockResolvedValue({
      id: '1',
      name: 'Acme',
      industries: [{ industry: { id: 'ind-saas', name: 'SaaS' } }],
    });
    const result = await service.create({ name: 'Acme', industryIds: ['ind-saas'] });
    // Response flattens the join rows into plain industries.
    expect(result.industries).toEqual([{ id: 'ind-saas', name: 'SaaS' }]);
    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Acme',
          industries: { create: [{ industryId: 'ind-saas' }] },
        },
      }),
    );
  });

  it('should list companies with pagination', async () => {
    prisma.company.findMany.mockResolvedValue([{ id: '1', name: 'Acme', industries: [] }]);
    prisma.company.count.mockResolvedValue(1);
    const result = await service.findAll(1, 20);
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should search companies by name', async () => {
    prisma.company.findMany.mockResolvedValue([]);
    prisma.company.count.mockResolvedValue(0);
    await service.findAll(1, 20, 'Tech');
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: { contains: 'Tech' } } }),
    );
  });

  it('should find one company with relations', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: '1', name: 'Acme', industries: [], people: [], deals: [] });
    const result = await service.findOne('1');
    expect(result.name).toBe('Acme');
  });

  it('should throw 404 for missing company', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('should update a company', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: '1', name: 'Acme' });
    prisma.company.update.mockResolvedValue({ id: '1', name: 'Acme Updated', industries: [] });
    const result = await service.update('1', { name: 'Acme Updated' });
    expect(result.name).toBe('Acme Updated');
    // No industryIds supplied, so the join table is left untouched.
    expect(prisma.companyIndustry.findMany).not.toHaveBeenCalled();
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '1' }, data: { name: 'Acme Updated' } }),
    );
  });

  it('should replace the industry set on update', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: '1', name: 'Acme' });
    // Currently linked to ind-a and ind-b; the update keeps ind-b and adds ind-c.
    prisma.companyIndustry.findMany.mockResolvedValue([
      { companyId: '1', industryId: 'ind-a' },
      { companyId: '1', industryId: 'ind-b' },
    ]);
    prisma.company.update.mockResolvedValue({ id: '1', name: 'Acme', industries: [] });

    await service.update('1', { industryIds: ['ind-b', 'ind-c'] });

    expect(prisma.companyIndustry.deleteMany).toHaveBeenCalledWith({
      where: { companyId: '1', industryId: { in: ['ind-a'] } },
    });
    expect(prisma.companyIndustry.create).toHaveBeenCalledWith({
      data: { companyId: '1', industryId: 'ind-c' },
    });
  });

  it('should delete a company with no related records', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: '1', name: 'Acme' });
    prisma.person.count.mockResolvedValue(0);
    prisma.deal.count.mockResolvedValue(0);
    prisma.company.delete.mockResolvedValue({});
    const result = await service.remove('1');
    expect(result.success).toBe(true);
  });

  it('should refuse to delete a company with related records', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: '1', name: 'Acme' });
    prisma.person.count.mockResolvedValue(2);
    prisma.deal.count.mockResolvedValue(1);
    await expect(service.remove('1')).rejects.toThrow(BadRequestException);
  });
});
