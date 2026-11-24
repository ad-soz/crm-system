import { Test, TestingModule } from '@nestjs/testing';
import { SearchService, searchWords } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

describe('searchWords', () => {
  it('splits on spaces, ignores case, and drops blanks', () => {
    expect(searchWords('  Quentin   ZORBLAX ')).toEqual(['quentin', 'zorblax']);
  });
  it('gives nothing for an empty or missing search', () => {
    expect(searchWords('')).toEqual([]);
    expect(searchWords('    ')).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
    expect(searchWords(null)).toEqual([]);
  });
  it('limits how many words, and how long each, so a pasted paragraph cannot build a huge query', () => {
    expect(searchWords('a b c d e f g h')).toHaveLength(6);
    expect(searchWords('x'.repeat(500))[0]).toHaveLength(100);
  });
  it('keeps search characters as ordinary text', () => {
    expect(searchWords("% _ ' ; --")).toEqual(['%', '_', "'", ';', '--']);
    expect(searchWords("'; DROP")).toEqual(["';", 'drop']);
  });
});

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      person: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn().mockResolvedValue([]) },
      deal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SearchService);
  });

  const sqlOf = (n: number) => prisma.$queryRawUnsafe.mock.calls[n][0] as string;
  const paramsOf = (n: number) => prisma.$queryRawUnsafe.mock.calls[n].slice(1) as unknown[];

  it('returns empty groups for an empty query, without touching the database', async () => {
    expect(await service.search('')).toEqual({ people: [], companies: [], deals: [] });
    expect(await service.search('   ')).toEqual({ people: [], companies: [], deals: [] });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('passes every word as a bound value, never as part of the SQL text', async () => {
    await service.search("zorblax '; DROP TABLE deals; --");
    for (let i = 0; i < prisma.$queryRawUnsafe.mock.calls.length; i++) {
      expect(sqlOf(i)).not.toContain('zorblax');
      expect(sqlOf(i)).not.toContain('DROP');
      expect(paramsOf(i)).toEqual(expect.arrayContaining(['zorblax', "';", 'drop']));
    }
  });

  it('asks for every word to be found, with one placeholder per word, plus one for ranking', async () => {
    await service.search('quentin zorblax');
    const sql = sqlOf(0);
    expect(sql.match(/instr\(/g)!.length).toBe(3); // two words + the ranking term
    expect(sql.match(/\?/g)!.length).toBe(3);
    expect(paramsOf(0)).toEqual(['quentin', 'zorblax', 'quentin']);
    expect(sql).toContain(' AND ');
  });

  it('shows at most five of each kind', async () => {
    await service.search('a');
    expect(prisma.$queryRawUnsafe.mock.calls.every((_: unknown, i: number) => /LIMIT 5\b/.test(sqlOf(i)))).toBe(true);
  });

  it('describes each kind in plain text and keeps the order the database ranked them', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'p2' }, { id: 'p1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([{ id: 'd1' }]);
    prisma.person.findMany.mockResolvedValue([
      { id: 'p1', firstName: 'Alice', lastName: 'Johnson', email: 'alice@x.com', company: { name: 'Acme' } },
      { id: 'p2', firstName: 'Bo', lastName: 'Ring', email: null, company: null },
    ]);
    prisma.company.findMany.mockResolvedValue([{ id: 'c1', name: 'Acme' }]);
    prisma.deal.findMany.mockResolvedValue([{ id: 'd1', title: 'Big Deal', amount: 42000, stage: { name: 'Lead' }, company: { name: 'Acme' } }]);

    const r = await service.search('a');
    expect(r.people.map((p) => p.label)).toEqual(['Bo Ring', 'Alice Johnson']);
    expect(r.people[1]).toEqual({ type: 'person', id: 'p1', label: 'Alice Johnson', sublabel: 'alice@x.com · Acme' });
    expect(r.people[0].sublabel).toBe('');
    expect(r.companies[0]).toEqual({ type: 'company', id: 'c1', label: 'Acme' });
    expect(r.deals[0]).toEqual({ type: 'deal', id: 'd1', label: 'Big Deal', sublabel: 'Lead · $42,000 · Acme' });
  });

  it('sends only text: a deal\'s stage is its name, never the stage record', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1' }]);
    prisma.deal.findMany.mockResolvedValue([{ id: 'd1', title: 'Deal', amount: 1, stage: { id: 'stage-lead', name: 'Lead', colour: 'info' }, company: null }]);
    const [deal] = (await service.search('deal')).deals;
    expect(typeof deal.sublabel).toBe('string');
    expect(JSON.stringify(deal)).not.toContain('colour');
  });

  it('searches only the areas the role profile can view', async () => {
    const r = await service.search('a', ['deals.view']);
    expect(r.people).toEqual([]);
    expect(r.companies).toEqual([]);
    expect(prisma.person.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(sqlOf(0)).toContain('FROM deals');
  });

  it('does not find or describe a deal by its company or person without the right to view them', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'd1' }]);
    prisma.deal.findMany.mockResolvedValue([{ id: 'd1', title: 'Deal', amount: 5, stage: { name: 'Lead' }, company: { name: 'Secret Co' } }]);
    const r = await service.search('deal', ['deals.view']);
    expect(sqlOf(0)).not.toContain('c.name');
    expect(sqlOf(0)).not.toContain('"firstName"');
    expect(r.deals[0].sublabel).toBe('Lead · $5');
  });

  it('finds a deal by its company and person once they may be viewed', async () => {
    await service.search('deal', ['deals.view', 'companies.view', 'people.view']);
    const dealSql = prisma.$queryRawUnsafe.mock.calls.map((_: unknown, i: number) => sqlOf(i)).find((s: string) => s.includes('FROM deals'))!;
    expect(dealSql).toContain('c.name');
    expect(dealSql).toContain('p."firstName"');
  });

  it('does not find a person by their company without the right to view companies', async () => {
    await service.search('acme', ['people.view']);
    expect(sqlOf(0)).not.toContain('c.name');
  });
});
