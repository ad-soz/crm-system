import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tasks from './Tasks';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import type { Paginated, Task, Deal, ReferenceValue } from '@/types';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

let permissions = ['tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const ref = (over: Partial<ReferenceValue>): ReferenceValue => ({
  id: 'x',
  name: 'Name',
  colour: 'secondary',
  sortOrder: 0,
  isActive: true,
  ...over,
});

const statuses: ReferenceValue[] = [
  ref({ id: 'status-todo', name: 'To Do' }),
  ref({ id: 'status-in-progress', name: 'In Progress', colour: 'warning' }),
  ref({ id: 'status-done', name: 'Done', colour: 'success', isDone: true }),
];

const tasks: Paginated<Task> = {
  data: [
    {
      id: 't1',
      title: 'Follow up call',
      statusId: 'status-todo',
      priorityId: 'priority-high',
      status: ref({ id: 'status-todo', name: 'To Do' }),
      priority: ref({ id: 'priority-high', name: 'High', colour: 'destructive' }),
      dueDate: new Date(Date.now() - 86400000).toISOString(),
      createdAt: '',
      updatedAt: '',
    },
  ],
  total: 1,
  page: 1,
  limit: 100,
  totalPages: 1,
};

const stageOpen = ref({ id: 'stage-lead', name: 'Lead', outcome: 'OPEN' });
const stageWon = ref({ id: 'stage-won', name: 'Won', outcome: 'WON' });
const dealBase = { amount: 1000, createdAt: '', updatedAt: '', company: { id: 'c1', name: 'Acme' } };
const deals: Paginated<Deal> = {
  data: [
    { ...dealBase, id: 'd1', title: 'Acme ERP', stageId: 'stage-lead', stage: stageOpen, expectedCloseDate: '2099-01-01T00:00:00.000Z', _count: { tasks: 3 } },
    { ...dealBase, id: 'd2', title: 'Old closed deal', stageId: 'stage-won', stage: stageWon, _count: { tasks: 0 } },
  ] as Deal[],
  total: 2,
  page: 1,
  limit: 500,
  totalPages: 1,
};

// Answer reference-list reads with the statuses, task reads with the tasks.
function routeGet(url: string) {
  if (url.startsWith('/reference/task-statuses')) {
    return Promise.resolve({ data: { key: 'task-statuses', values: statuses } });
  }
  if (url.startsWith('/reference/')) {
    return Promise.resolve({ data: { key: 'x', values: [] } });
  }
  if (url.startsWith('/deals')) return Promise.resolve({ data: deals });
  return Promise.resolve({ data: tasks });
}

describe('Tasks page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete'];
    (api.get as any).mockImplementation(routeGet);
  });

  it('renders rows and highlights overdue tasks', async () => {
    renderWithProviders(
      <ToastProvider>
        <Tasks />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText('Follow up call')).toBeInTheDocument());
    expect(screen.getByText(/\(overdue\)/i)).toBeInTheDocument();
  });

  it('updates status inline via the select', async () => {
    (api.patch as any).mockResolvedValue({ data: {} });
    renderWithProviders(
      <ToastProvider>
        <Tasks />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText('Follow up call')).toBeInTheDocument());
    // Wait for the status list to populate the inline select.
    await waitFor(() => expect(screen.getByDisplayValue('To Do')).toBeInTheDocument());

    const select = screen.getByDisplayValue('To Do');
    await userEvent.selectOptions(select, 'status-done');

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/tasks/t1', { statusId: 'status-done' }),
    );
  });
});

describe('Tasks page with a view-only role profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['tasks.view'];
    (api.get as any).mockImplementation(routeGet);
  });

  it('hides New Task and locks the inline status change', async () => {
    renderWithProviders(
      <ToastProvider>
        <Tasks />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText('Follow up call')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /new task/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue('To Do')).toBeDisabled());
  });
});

describe('Tasks page with deals in the task family', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['tasks.view', 'tasks.create', 'tasks.edit', 'deals.view'];
    (api.get as any).mockImplementation(routeGet);
  });

  const show = () =>
    renderWithProviders(
      <ToastProvider>
        <Tasks />
      </ToastProvider>,
    );

  it('lists open deals beside tasks, with how many tasks sit under each deal', async () => {
    show();
    expect(await screen.findByText('Acme ERP')).toBeInTheDocument();
    expect(screen.getByText('Follow up call')).toBeInTheDocument();
    expect(screen.getByText('3 tasks under this deal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme ERP' })).toHaveAttribute('href', '/deals/d1');
  });

  it('leaves out deals that are won or lost', async () => {
    show();
    await screen.findByText('Acme ERP');
    expect(screen.queryByText('Old closed deal')).not.toBeInTheDocument();
  });

  it('can show tasks only, or open deals only', async () => {
    show();
    await screen.findByText('Acme ERP');
    await userEvent.click(screen.getByRole('button', { name: 'Tasks only' }));
    expect(screen.queryByText('Acme ERP')).not.toBeInTheDocument();
    expect(screen.getByText('Follow up call')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open deals only' }));
    expect(await screen.findByText('Acme ERP')).toBeInTheDocument();
    expect(screen.queryByText('Follow up call')).not.toBeInTheDocument();
  });

  it('hides deals when a task status is chosen, because deals have stages instead', async () => {
    show();
    await screen.findByText('Acme ERP');
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Acme ERP')).not.toBeInTheDocument());
  });

  it('does not ask for deals, or offer the filter, without permission to view deals', async () => {
    permissions = ['tasks.view'];
    show();
    await screen.findByText('Follow up call');
    expect(screen.queryByRole('button', { name: 'Tasks only' })).not.toBeInTheDocument();
    expect((api.get as any).mock.calls.some((c: any[]) => String(c[0]).startsWith('/deals'))).toBe(false);
  });

  it('shows which contact a task came from', async () => {
    tasks.data[0] = { ...tasks.data[0], contact: { id: 'c9', subject: 'Call with Anna' } };
    show();
    expect(await screen.findByText('From: Call with Anna')).toBeInTheDocument();
    tasks.data[0] = { ...tasks.data[0], contact: null };
  });
});
