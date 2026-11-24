import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from '../permissions/permissions';

/** What the search box draws: every field here is plain text, which is all the screen can show. */
export interface SearchItem {
  type: 'person' | 'company' | 'deal';
  id: string;
  label: string;
  sublabel?: string;
}

const PER_KIND = 5;
const MAX_WORDS = 6;
const MAX_WORD_LENGTH = 100;

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const joinText = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/**
 * Words typed in the search box. Every word must be found somewhere in the record, in any order, so
 * "quentin zorblax" and "zorblax quentin" both find Quentin Zorblax. Capped so a pasted paragraph
 * cannot build an enormous query.
 */
export function searchWords(query: string | undefined | null): string[] {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, MAX_WORD_LENGTH))
    .slice(0, MAX_WORDS);
}

/**
 * Global search across people, companies and deals.
 *
 * - Words match as plain text. (The database's own pattern matching treats % and _ as wildcards, so
 *   searching for "%" used to match everything; `instr` has no such characters.)
 * - Only areas the person may view are searched, and a record is never found, or described, by
 *   something from an area they may not view (for example a deal by its company name).
 */
@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(query: string, permissions: string[] = ALL_PERMISSIONS) {
    const words = searchWords(query);
    if (words.length === 0) return { people: [] as SearchItem[], companies: [] as SearchItem[], deals: [] as SearchItem[] };

    const can = (p: string) => permissions.includes(p);
    const [people, companies, deals] = await Promise.all([
      can('people.view') ? this.people(words, can('companies.view')) : [],
      can('companies.view') ? this.companies(words) : [],
      can('deals.view') ? this.deals(words, can('companies.view'), can('people.view')) : [],
    ]);
    return { people, companies, deals };
  }

  /** "every word is somewhere in `haystack`" as SQL with one placeholder per word. */
  private matchAll(haystack: string, words: string[]) {
    return words.map(() => `instr(${haystack}, ?) > 0`).join(' AND ');
  }

  /** Records in the order the database ranked them (names that start with the first word come first). */
  private inOrder<T extends { id: string }>(ids: { id: string }[], records: T[]): T[] {
    const byId = new Map(records.map((r) => [r.id, r]));
    return ids.map((r) => byId.get(r.id)).filter((r): r is T => !!r);
  }

  private async people(words: string[], seeCompanies: boolean): Promise<SearchItem[]> {
    const haystack =
      `lower(p."firstName" || ' ' || p."lastName" || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.phone, '')` +
      (seeCompanies ? ` || ' ' || coalesce(c.name, '')` : '') +
      ')';
    const ids = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT p.id FROM people p LEFT JOIN companies c ON c.id = p.company_id
        WHERE ${this.matchAll(haystack, words)}
        ORDER BY (instr(lower(p."firstName" || ' ' || p."lastName"), ?) = 1) DESC, p."lastName", p."firstName"
        LIMIT ${PER_KIND}`,
      ...words,
      words[0],
    );
    if (!ids.length) return [];
    const rows = await this.prisma.person.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: { id: true, firstName: true, lastName: true, email: true, company: { select: { name: true } } },
    });
    return this.inOrder(ids, rows).map((p) => ({
      type: 'person' as const,
      id: p.id,
      label: `${p.firstName} ${p.lastName}`.trim(),
      sublabel: joinText(p.email, seeCompanies && p.company?.name),
    }));
  }

  private async companies(words: string[]): Promise<SearchItem[]> {
    const ids = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM companies
        WHERE ${this.matchAll('lower(name)', words)}
        ORDER BY (instr(lower(name), ?) = 1) DESC, name
        LIMIT ${PER_KIND}`,
      ...words,
      words[0],
    );
    if (!ids.length) return [];
    const rows = await this.prisma.company.findMany({ where: { id: { in: ids.map((r) => r.id) } }, select: { id: true, name: true } });
    return this.inOrder(ids, rows).map((c) => ({ type: 'company' as const, id: c.id, label: c.name }));
  }

  private async deals(words: string[], seeCompanies: boolean, seePeople: boolean): Promise<SearchItem[]> {
    const haystack =
      `lower(d.title` +
      (seeCompanies ? ` || ' ' || coalesce(c.name, '')` : '') +
      (seePeople ? ` || ' ' || coalesce(p."firstName", '') || ' ' || coalesce(p."lastName", '')` : '') +
      ')';
    const ids = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT d.id FROM deals d
        LEFT JOIN companies c ON c.id = d.company_id
        LEFT JOIN people p ON p.id = d.person_id
        WHERE ${this.matchAll(haystack, words)}
        ORDER BY (instr(lower(d.title), ?) = 1) DESC, d.title
        LIMIT ${PER_KIND}`,
      ...words,
      words[0],
    );
    if (!ids.length) return [];
    const rows = await this.prisma.deal.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: { id: true, title: true, amount: true, stage: { select: { name: true } }, company: { select: { name: true } } },
    });
    return this.inOrder(ids, rows).map((d) => ({
      type: 'deal' as const,
      id: d.id,
      label: d.title,
      // The stage is a record with a name; the screen can only draw text, so it is the name that is sent.
      sublabel: joinText(d.stage?.name, money(d.amount), seeCompanies && d.company?.name),
    }));
  }
}
