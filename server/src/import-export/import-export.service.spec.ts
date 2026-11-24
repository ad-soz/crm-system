import { Test, TestingModule } from '@nestjs/testing';
import { ImportExportService } from './import-export.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImportExportService', () => {
  let service: ImportExportService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      person: { findMany: jest.fn(), create: jest.fn() },
      company: { findFirst: jest.fn(), create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ImportExportService);
  });

  it('should generate CSV with a header and rows', async () => {
    prisma.person.findMany.mockResolvedValue([
      {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@x.com',
        phone: '123',
        title: 'Manager',
        company: { name: 'Acme' },
      },
    ]);
    const csv = await service.exportPeople();
    expect(csv).toContain('firstName,lastName,email,phone,title,companyName');
    expect(csv).toContain('Alice,Johnson,alice@x.com,123,Manager,Acme');
  });

  it('neutralises spreadsheet formulas in exported cells', async () => {
    prisma.person.findMany.mockResolvedValue([
      {
        firstName: '=HYPERLINK("http://evil.example","click")',
        lastName: '+SUM(A1)',
        email: '@cmd',
        phone: '-2+3',
        title: 'Normal title',
        company: { name: 'Acme' },
      },
    ]);
    const csv = await service.exportPeople();
    const row = csv.split('\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(row).toContain(`'+SUM(A1)`);
    expect(row).toContain(`'@cmd`);
    expect(row).toContain(`'-2+3`);
    expect(row).toContain('Normal title');
  });

  it('should import valid rows', async () => {
    prisma.company.findFirst.mockResolvedValue({ id: 'co1', name: 'Acme' });
    prisma.person.create.mockResolvedValue({ id: '1' });

    const csv = 'firstName,lastName,email,phone,title,companyName\nAlice,Johnson,alice@x.com,123,Manager,Acme';
    const result = await service.importPeople(Buffer.from(csv), 'user-1');

    expect(result.total).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  it('should report rows missing required fields', async () => {
    const csv = 'firstName,lastName,email\n,NoFirst,x@x.com\nValid,Person,valid@x.com';
    prisma.person.create.mockResolvedValue({ id: '1' });
    const result = await service.importPeople(Buffer.from(csv), 'user-1');

    expect(result.total).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].row).toBe(2);
  });

  it('should report invalid email rows', async () => {
    const csv = 'firstName,lastName,email\nBad,Email,not-an-email';
    const result = await service.importPeople(Buffer.from(csv), 'user-1');
    expect(result.imported).toBe(0);
    expect(result.errors[0].message).toContain('Invalid email');
  });

  it('should auto-create a company by name', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.company.create.mockResolvedValue({ id: 'new-co', name: 'NewCo' });
    prisma.person.create.mockResolvedValue({ id: '1' });

    const csv = 'firstName,lastName,companyName\nJane,Doe,NewCo';
    const result = await service.importPeople(Buffer.from(csv), 'user-1');

    expect(result.imported).toBe(1);
    expect(prisma.company.create).toHaveBeenCalledWith({ data: { name: 'NewCo' } });
  });
});
