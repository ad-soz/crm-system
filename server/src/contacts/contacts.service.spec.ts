import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';

describe('ContactsService', () => {
  let service: ContactsService;
  let prisma: any;
  let ref: any;

  beforeEach(async () => {
    prisma = {
      contact: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      person: { findUnique: jest.fn() },
      deal: { findUnique: jest.fn() },
    };
    ref = { defaultId: jest.fn().mockResolvedValue('type-call') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReferenceDataService, useValue: ref },
      ],
    }).compile();

    service = module.get(ContactsService);
  });

  it('creates a contact for a person, defaulting the type', async () => {
    prisma.person.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.contact.create.mockResolvedValue({ id: '1' });
    await service.create({ subject: 'Call', personId: 'c1' }, 'user-1');
    expect(ref.defaultId).toHaveBeenCalledWith('contactType');
    expect(prisma.contact.create.mock.calls[0][0].data.typeId).toBe('type-call');
  });

  it('creates a contact for a deal with an explicit type id', async () => {
    prisma.deal.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.contact.create.mockResolvedValue({ id: '1' });
    await service.create({ typeId: 'type-meeting', subject: 'Demo', dealId: 'd1' }, 'user-1');
    expect(ref.defaultId).not.toHaveBeenCalled();
    expect(prisma.contact.create.mock.calls[0][0].data.typeId).toBe('type-meeting');
  });

  it('rejects a contact with no person or deal', async () => {
    await expect(service.create({ subject: 'Orphan' }, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('filters by type id', async () => {
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
    await service.findAll(1, 50, undefined, undefined, 'type-email');
    expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { typeId: 'type-email' } }));
  });

  it('updates a contact subject', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: '1' });
    prisma.contact.update.mockResolvedValue({ id: '1', subject: 'Updated' });
    expect((await service.update('1', { subject: 'Updated' })).subject).toBe('Updated');
  });

  it('deletes a contact', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: '1' });
    prisma.contact.delete.mockResolvedValue({});
    expect((await service.remove('1')).success).toBe(true);
  });
});
