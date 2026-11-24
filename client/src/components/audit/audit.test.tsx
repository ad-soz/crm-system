import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditEntryItem } from './AuditEntryItem';
import { RecordHistory } from './RecordHistory';
import { AuditSection } from './AuditSection';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import type { AuditEntry, AuditPage } from '@/types';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn() } };
});

let permissions = ['audit.view'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: '2026-11-09T10:30:00.000Z',
  actor: { id: 'u1', name: 'Ann Auditor' },
  action: 'update',
  entity: 'deals',
  entityLabel: 'Deal',
  recordId: 'd1',
  recordLabel: 'Acme ERP',
  field: 'amount',
  fieldLabel: 'Amount',
  oldValue: '1000',
  newValue: '1500',
  values: null,
  ...over,
});

const page = (data: AuditEntry[], over: Partial<AuditPage> = {}): AuditPage => ({
  data,
  total: data.length,
  page: 1,
  limit: 50,
  totalPages: 1,
  since: '2026-11-01T09:00:00.000Z',
  ...over,
});

const show = (ui: React.ReactElement, route = '/') => renderWithProviders(<ul>{ui}</ul>, { route });

describe('AuditEntryItem', () => {
  it('reads as who, what, which record, and the field from old to new', () => {
    show(<AuditEntryItem entry={entry()} />);
    expect(screen.getByText('Ann Auditor')).toBeInTheDocument();
    expect(screen.getByText(/changed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme ERP' })).toHaveAttribute('href', '/deals/d1');
    expect(screen.getByText('Amount:')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('1500')).toBeInTheDocument();
  });

  it('shows a cleared value as empty, not as nothing', () => {
    show(<AuditEntryItem entry={entry({ oldValue: '555', newValue: null, fieldLabel: 'Phone', field: 'phone' })} />);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('calls a change made by no one System', () => {
    show(<AuditEntryItem entry={entry({ actor: null })} />);
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('offers the starting values of a new record, and what a deleted one contained', async () => {
    const values = [{ field: 'Name', value: 'Acme' }, { field: 'Phone', value: '555' }];
    const { unmount } = show(<AuditEntryItem entry={entry({ action: 'create', field: null, fieldLabel: null, oldValue: null, newValue: null, values })} />);
    expect(screen.getByText('created')).toBeInTheDocument();
    expect(screen.getByText('Starting values')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    unmount();
    show(<AuditEntryItem entry={entry({ action: 'delete', field: null, fieldLabel: null, values })} />);
    expect(screen.getByText('deleted')).toBeInTheDocument();
    expect(screen.getByText('What it contained')).toBeInTheDocument();
  });

  it('names a deleted record but does not link to a page that no longer exists', () => {
    show(<AuditEntryItem entry={entry({ action: 'delete', recordLabel: 'Gone Co (deleted)', field: null, fieldLabel: null })} />);
    expect(screen.getByText('Gone Co (deleted)')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('can leave the record out when the page already is that record', () => {
    show(<AuditEntryItem entry={entry()} showRecord={false} />);
    expect(screen.queryByText('Acme ERP')).not.toBeInTheDocument();
    expect(screen.getByText('Amount:')).toBeInTheDocument();
  });

  it('shows the address tried on a failed sign-in', () => {
    show(<AuditEntryItem entry={entry({ action: 'sign_in_failed', entity: 'session', entityLabel: 'Sign-in', actor: null, recordId: null, recordLabel: null, field: null, fieldLabel: null, oldValue: null, newValue: 'Tried: x@y.com' })} />);
    expect(screen.getByText('failed to sign in')).toBeInTheDocument();
    expect(screen.getByText('Tried: x@y.com')).toBeInTheDocument();
  });
});

describe('RecordHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['audit.view'];
  });

  it('shows the changes to one record, asking only for that record', async () => {
    (api.get as any).mockResolvedValue({ data: page([entry(), entry({ id: 2, action: 'create', field: null, fieldLabel: null, values: [{ field: 'Title', value: 'Acme ERP' }] })]) });
    renderWithProviders(<RecordHistory entity="deals" recordId="d1" />);
    const list = await screen.findByRole('list', { name: /history of this record/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith('/audit', { params: expect.objectContaining({ entity: 'deals', recordId: 'd1' }) });
  });

  it('is not shown, and asks for nothing, without permission to see the audit log', () => {
    permissions = ['deals.view'];
    renderWithProviders(<RecordHistory entity="deals" recordId="d1" />);
    expect(screen.queryByText('History')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('says so when there is nothing yet, and what is not covered', async () => {
    (api.get as any).mockResolvedValue({ data: page([]) });
    renderWithProviders(<RecordHistory entity="deals" recordId="d1" />);
    expect(await screen.findByText(/no changes recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/before the audit log began are not included/i)).toBeInTheDocument();
  });

  it('links to the full list when there are more than fit', async () => {
    (api.get as any).mockResolvedValue({ data: page([entry()], { total: 57 }) });
    renderWithProviders(<RecordHistory entity="deals" recordId="d1" />);
    const link = await screen.findByRole('link', { name: /see all 57/i });
    expect(link).toHaveAttribute('href', '/settings/audit?entity=deals&recordId=d1');
  });
});

describe('AuditSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['audit.view'];
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/audit/entities') return Promise.resolve({ data: [{ value: 'deals', label: 'Deal' }, { value: 'people', label: 'Person' }] });
      if (url === '/audit/actors') return Promise.resolve({ data: [{ id: 'u1', name: 'Ann Auditor' }] });
      return Promise.resolve({ data: page([entry(), entry({ id: 2, field: 'title', fieldLabel: 'Title', oldValue: 'Acme', newValue: 'Acme ERP' })]) });
    });
  });

  const lastAuditParams = () => {
    const calls = (api.get as any).mock.calls.filter((c: any[]) => c[0] === '/audit');
    return calls[calls.length - 1][1].params;
  };

  it('lists entries and says when recording began', async () => {
    renderWithProviders(<AuditSection />);
    expect(await screen.findByRole('list', { name: /audit log entries/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/recording began/i)).toBeInTheDocument();
    expect(screen.getByText(/entries cannot be edited or deleted/i)).toBeInTheDocument();
  });

  it('filters by who, kind of record and action', async () => {
    renderWithProviders(<AuditSection />);
    await screen.findByRole('list', { name: /audit log entries/i });
    await screen.findByRole('option', { name: 'Ann Auditor' });
    await userEvent.selectOptions(screen.getByLabelText('Who'), 'u1');
    await userEvent.selectOptions(screen.getByLabelText('Kind of record'), 'deals');
    await userEvent.selectOptions(screen.getByLabelText('Action'), 'update');
    await waitFor(() => expect(lastAuditParams()).toMatchObject({ actorId: 'u1', entity: 'deals', action: 'update' }));
  });

  it('turns a picked date into the whole day', async () => {
    renderWithProviders(<AuditSection />);
    await screen.findByRole('list', { name: /audit log entries/i });
    fireDate(screen.getByLabelText('From'), '2026-11-09');
    fireDate(screen.getByLabelText('To'), '2026-11-09');
    await waitFor(() => expect(lastAuditParams().to).toBeDefined());
    const { from, to } = lastAuditParams();
    expect(new Date(from).getTime()).toBe(new Date('2026-11-09T00:00:00').getTime());
    expect(new Date(to).getTime()).toBe(new Date('2026-11-09T23:59:59.999').getTime());
  });

  it('can be opened already showing one record, and can go back to all of them', async () => {
    renderWithProviders(<AuditSection />, { route: '/settings/audit?entity=deals&recordId=d1' });
    await screen.findByRole('list', { name: /audit log entries/i });
    expect(lastAuditParams()).toMatchObject({ entity: 'deals', recordId: 'd1' });
    await userEvent.click(screen.getByRole('button', { name: /show all records/i }));
    await waitFor(() => expect(lastAuditParams().recordId).toBeUndefined());
  });

  it('moves between pages, newest first', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/audit/')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: page([entry()], { total: 120, totalPages: 3 }) });
    });
    renderWithProviders(<AuditSection />);
    await screen.findByText(/1-1 of 120/);
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    await waitFor(() => expect(lastAuditParams().page).toBe(2));
  });

  it('says when nothing matches the filters', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/audit/')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: page([]) });
    });
    renderWithProviders(<AuditSection />, { route: '/settings/audit?action=delete' });
    expect(await screen.findByText(/nothing matches those filters/i)).toBeInTheDocument();
  });
});

// A date box is set by its value, then told it changed.
function fireDate(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
