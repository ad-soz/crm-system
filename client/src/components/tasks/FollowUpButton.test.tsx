import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FollowUpButton } from './FollowUpButton';
import { TaskListItem } from './TaskListItem';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import type { Task } from '@/types';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

let permissions = ['tasks.view', 'tasks.create'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const contact = { id: 'c1', subject: 'Call with Anna' };

const show = () =>
  renderWithProviders(
    <ToastProvider>
      <FollowUpButton contact={contact} />
    </ToastProvider>,
  );

describe('FollowUpButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['tasks.view', 'tasks.create'];
    (api.get as any).mockResolvedValue({ data: { key: 'x', values: [], data: [] } });
  });

  it('opens a task form that already knows which contact it follows up', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /follow up: call with anna/i }));
    expect(await screen.findByLabelText('Title *')).toHaveValue('Follow up: Call with Anna');
    expect(screen.getByText(/new task from: call with anna/i)).toBeInTheDocument();
  });

  it('creates the task with the contact id and no person or deal of its own', async () => {
    (api.post as any).mockResolvedValue({ data: { id: 't1' } });
    show();
    await userEvent.click(screen.getByRole('button', { name: /follow up/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = (api.post as any).mock.calls[0];
    expect(url).toBe('/tasks');
    expect(body).toMatchObject({ title: 'Follow up: Call with Anna', contactId: 'c1' });
    // The server copies person and deal from the contact, so none are sent.
    expect(body.personId).toBeUndefined();
    expect(body.dealId).toBeUndefined();
  });

  it('shows the server reason when the task is refused', async () => {
    (api.post as any).mockRejectedValue({ isAxiosError: true, response: { data: { message: 'A task cannot be about a different person than the contact it follows up' } } });
    show();
    await userEvent.click(screen.getByRole('button', { name: /follow up/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/different person/i)).toBeInTheDocument();
  });

  it('is not offered to someone who cannot create tasks', () => {
    permissions = ['tasks.view'];
    show();
    expect(screen.queryByRole('button', { name: /follow up/i })).not.toBeInTheDocument();
  });
});

describe('TaskListItem', () => {
  const task = {
    id: 't1',
    title: 'Send brochure',
    statusId: 's',
    priorityId: 'p',
    status: { id: 's', name: 'To Do', colour: 'secondary', sortOrder: 0, isActive: true },
    priority: { id: 'p', name: 'High', colour: 'destructive', sortOrder: 0, isActive: true },
    createdAt: '',
    updatedAt: '',
  } as Task;

  it('says which contact the task came from', () => {
    renderWithProviders(
      <ToastProvider>
        <ul><TaskListItem task={{ ...task, contact: { id: 'c1', subject: 'Call with Anna' } }} /></ul>
      </ToastProvider>,
    );
    expect(screen.getByText(/from: call with anna/i)).toBeInTheDocument();
  });

  it('says nothing about a contact when there is none', () => {
    renderWithProviders(
      <ToastProvider>
        <ul><TaskListItem task={task} /></ul>
      </ToastProvider>,
    );
    expect(screen.queryByText(/from:/i)).not.toBeInTheDocument();
  });
});
