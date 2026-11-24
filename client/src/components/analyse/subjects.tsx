import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { type Column, type ViewDefaults } from '@/lib/analyse';
import type { ReferenceColour } from '@/types';

// ---------------------------------------------------------------- the rows the server sends

export interface DealRow {
  id: string;
  title: string;
  companyId: string | null;
  company: string | null;
  personId: string | null;
  person: string | null;
  owner: string | null;
  stage: string;
  stageColour: ReferenceColour;
  outcome: 'OPEN' | 'WON' | 'LOST';
  amount: number;
  winChance: number | null;
  expected: number | null;
  expectedCloseDate: string | null;
  createdAt: string | null;
  contacts: number | null;
  lastContactAt: string | null;
  tasks: number | null;
  openTasks: number | null;
}

export interface PersonRow {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  company: string | null;
  owner: string | null;
  createdAt: string | null;
  contacts: number | null;
  lastContactAt: string | null;
  openDeals: number | null;
  openDealValue: number | null;
  openTasks: number | null;
}

export interface CompanyRow {
  id: string;
  name: string;
  industries: string[];
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string | null;
  people: number | null;
  deals: number | null;
  openDeals: number | null;
  openDealValue: number | null;
}

export type Dataset = 'people' | 'companies' | 'deals';

/** A column the table can show, with how to draw it. The engine only needs `Column`. */
export interface TableColumn<R> extends Column<R> {
  render?: (row: R) => ReactNode;
  align?: 'right';
}

const DAY = 24 * 60 * 60 * 1000;
const daysSince = (iso: string | null | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null);
const plain = (v: ReactNode) => <span>{v ?? '-'}</span>;
const link = (to: string, text: string) => <Link to={to} className="font-medium hover:underline">{text}</Link>;
const money = (n: number | null) => (n === null ? '-' : formatCurrency(n));
const date = (iso: string | null) => (iso ? formatDate(iso) : '-');
const OUTCOME: Record<DealRow['outcome'], string> = { OPEN: 'Open', WON: 'Won', LOST: 'Lost' };

// ---------------------------------------------------------------- columns

export function dealColumns(now: number): TableColumn<DealRow>[] {
  return [
    { key: 'title', label: 'Deal', type: 'text', get: (r) => r.title, defaultVisible: true, render: (r) => link(`/deals/${r.id}`, r.title) },
    { key: 'company', label: 'Company', type: 'category', get: (r) => r.company, defaultVisible: true, render: (r) => (r.companyId && r.company ? <Link to={`/companies/${r.companyId}`} className="hover:underline">{r.company}</Link> : plain(null)) },
    { key: 'person', label: 'Person', type: 'category', get: (r) => r.person, render: (r) => (r.personId && r.person ? <Link to={`/people/${r.personId}`} className="hover:underline">{r.person}</Link> : plain(null)) },
    { key: 'owner', label: 'Owner', type: 'category', get: (r) => r.owner, defaultVisible: true },
    { key: 'stage', label: 'Stage', type: 'category', get: (r) => r.stage, defaultVisible: true, render: (r) => <Badge variant={r.stageColour ?? 'secondary'}>{r.stage}</Badge> },
    { key: 'outcome', label: 'Outcome', type: 'category', get: (r) => OUTCOME[r.outcome], render: (r) => plain(OUTCOME[r.outcome]) },
    { key: 'amount', label: 'Amount', type: 'currency', get: (r) => r.amount, defaultVisible: true, align: 'right', render: (r) => money(r.amount) },
    { key: 'winChance', label: 'Win chance', type: 'percent', get: (r) => r.winChance, align: 'right', render: (r) => (r.winChance === null ? '-' : `${r.winChance}%`) },
    { key: 'expected', label: 'Expected', type: 'currency', get: (r) => r.expected, defaultVisible: true, align: 'right', render: (r) => money(r.expected) },
    { key: 'expectedCloseDate', label: 'Expected close', type: 'date', get: (r) => r.expectedCloseDate, defaultVisible: true, render: (r) => date(r.expectedCloseDate) },
    { key: 'createdAt', label: 'Created', type: 'date', get: (r) => r.createdAt, render: (r) => date(r.createdAt) },
    { key: 'age', label: 'Age (days)', type: 'number', get: (r) => daysSince(r.createdAt, now), align: 'right', render: (r) => daysSince(r.createdAt, now) ?? '-' },
    { key: 'lastContactAt', label: 'Last contact', type: 'date', get: (r) => r.lastContactAt, render: (r) => date(r.lastContactAt) },
    { key: 'sinceContact', label: 'Days since contact', type: 'number', get: (r) => daysSince(r.lastContactAt, now), align: 'right', render: (r) => daysSince(r.lastContactAt, now) ?? '-' },
    { key: 'contacts', label: 'Contacts', type: 'number', get: (r) => r.contacts, align: 'right', render: (r) => r.contacts ?? '-' },
    { key: 'openTasks', label: 'Open tasks', type: 'number', get: (r) => r.openTasks, align: 'right', render: (r) => r.openTasks ?? '-' },
    { key: 'tasks', label: 'All tasks', type: 'number', get: (r) => r.tasks, align: 'right', render: (r) => r.tasks ?? '-' },
  ];
}

export function personColumns(now: number): TableColumn<PersonRow>[] {
  return [
    { key: 'name', label: 'Name', type: 'text', get: (r) => r.name, defaultVisible: true, render: (r) => link(`/people/${r.id}`, r.name) },
    { key: 'title', label: 'Job title', type: 'category', get: (r) => r.title, defaultVisible: true },
    { key: 'company', label: 'Company', type: 'category', get: (r) => r.company, defaultVisible: true, render: (r) => (r.companyId && r.company ? <Link to={`/companies/${r.companyId}`} className="hover:underline">{r.company}</Link> : plain(null)) },
    { key: 'owner', label: 'Owner', type: 'category', get: (r) => r.owner, defaultVisible: true },
    { key: 'email', label: 'Email', type: 'text', get: (r) => r.email },
    { key: 'phone', label: 'Phone', type: 'text', get: (r) => r.phone },
    { key: 'createdAt', label: 'Added', type: 'date', get: (r) => r.createdAt, defaultVisible: true, render: (r) => date(r.createdAt) },
    { key: 'openDeals', label: 'Open deals', type: 'number', get: (r) => r.openDeals, defaultVisible: true, align: 'right', render: (r) => r.openDeals ?? '-' },
    { key: 'openDealValue', label: 'Open deal value', type: 'currency', get: (r) => r.openDealValue, defaultVisible: true, align: 'right', render: (r) => money(r.openDealValue) },
    { key: 'openTasks', label: 'Open tasks', type: 'number', get: (r) => r.openTasks, align: 'right', render: (r) => r.openTasks ?? '-' },
    { key: 'contacts', label: 'Contacts', type: 'number', get: (r) => r.contacts, align: 'right', render: (r) => r.contacts ?? '-' },
    { key: 'lastContactAt', label: 'Last contact', type: 'date', get: (r) => r.lastContactAt, render: (r) => date(r.lastContactAt) },
    { key: 'sinceContact', label: 'Days since contact', type: 'number', get: (r) => daysSince(r.lastContactAt, now), align: 'right', render: (r) => daysSince(r.lastContactAt, now) ?? '-' },
  ];
}

export function companyColumns(): TableColumn<CompanyRow>[] {
  return [
    { key: 'name', label: 'Company', type: 'text', get: (r) => r.name, defaultVisible: true, render: (r) => link(`/companies/${r.id}`, r.name) },
    { key: 'industry', label: 'Industry', type: 'category', get: (r) => r.industries, defaultVisible: true, render: (r) => plain(r.industries.length ? r.industries.join(', ') : null) },
    { key: 'website', label: 'Website', type: 'text', get: (r) => r.website },
    { key: 'phone', label: 'Phone', type: 'text', get: (r) => r.phone },
    { key: 'email', label: 'Email', type: 'text', get: (r) => r.email },
    { key: 'address', label: 'Address', type: 'text', get: (r) => r.address },
    { key: 'createdAt', label: 'Added', type: 'date', get: (r) => r.createdAt, defaultVisible: true, render: (r) => date(r.createdAt) },
    { key: 'people', label: 'People', type: 'number', get: (r) => r.people, defaultVisible: true, align: 'right', render: (r) => r.people ?? '-' },
    { key: 'openDeals', label: 'Open deals', type: 'number', get: (r) => r.openDeals, defaultVisible: true, align: 'right', render: (r) => r.openDeals ?? '-' },
    { key: 'openDealValue', label: 'Open deal value', type: 'currency', get: (r) => r.openDealValue, defaultVisible: true, align: 'right', render: (r) => money(r.openDealValue) },
    { key: 'deals', label: 'All deals', type: 'number', get: (r) => r.deals, align: 'right', render: (r) => r.deals ?? '-' },
  ];
}

// ---------------------------------------------------------------- what each dashboard card opens

export type SubjectKey = 'people' | 'companies' | 'open-deals' | 'pipeline' | 'forecast';

export interface SubjectInfo {
  key: SubjectKey;
  dataset: Dataset;
  title: string;
  description: string;
  /** The permission needed to see these rows. */
  permission: string;
  defaults: ViewDefaults;
  /** Word for one row, for "12 deals". */
  noun: [string, string];
  /** Deals only: the figure starts with open deals, and can be widened to include won and lost. */
  openOnly?: boolean;
}

export const SUBJECTS: Record<SubjectKey, SubjectInfo> = {
  people: {
    key: 'people',
    dataset: 'people',
    title: 'People',
    description: 'Everyone you deal with. Group, filter and sort to see who is worth a call.',
    permission: 'people.view',
    defaults: { group: 'company', measure: '', sort: 'createdAt', dir: 'desc' },
    noun: ['person', 'people'],
  },
  companies: {
    key: 'companies',
    dataset: 'companies',
    title: 'Companies',
    description: 'Every company, with its people and deals.',
    permission: 'companies.view',
    defaults: { group: 'industry', measure: '', sort: 'name', dir: 'asc' },
    noun: ['company', 'companies'],
  },
  'open-deals': {
    key: 'open-deals',
    dataset: 'deals',
    title: 'Open deals',
    description: 'Every deal still being worked.',
    permission: 'deals.view',
    defaults: { group: 'stage', measure: '', sort: 'amount', dir: 'desc' },
    noun: ['deal', 'deals'],
    openOnly: true,
  },
  pipeline: {
    key: 'pipeline',
    dataset: 'deals',
    title: 'Pipeline value',
    description: 'What the open deals are worth, before allowing for the chance of winning.',
    permission: 'deals.view',
    defaults: { group: 'stage', measure: 'amount', sort: 'amount', dir: 'desc' },
    noun: ['deal', 'deals'],
    openOnly: true,
  },
  forecast: {
    key: 'forecast',
    dataset: 'deals',
    title: 'Weighted forecast',
    description: 'What the open deals are expected to bring in: each amount times its stage\'s chance of winning.',
    permission: 'deals.view',
    defaults: { group: 'expectedCloseDate', measure: 'expected', sort: 'expected', dir: 'desc' },
    noun: ['deal', 'deals'],
    openOnly: true,
  },
};

export const isSubject = (k: string | undefined): k is SubjectKey => !!k && k in SUBJECTS;
