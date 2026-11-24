import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskActions } from './TaskActions';
import { ToastProvider } from '@/context/ToastContext';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';
import type { Task } from '@/types';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

let permissions = ['tasks.view', 'tasks.edit', 'tasks.delete'];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const task = {
  id: 't1',
  title: 'Send brochure',
  description: 'The 2027 one',
  dueDate: '2026-12-01T00:00:00.000Z',
  statusId: 's1',
  priorityId: 'p1',
  status: { id: 's1', name: 'To Do', colour: 'secondary', sortOrder: 0, isActive: true },
  priority: { id: 'p1', name: 'High', colour: 'destructive', sortOrder: 0, isActive: true },
  personId: 'person-1',
  contactId: 'c1',
  contact: { id: 'c1', subject: 'Call with Anna' },
  createdAt: '',
  updatedAt: '',
} as Task;

const show = (t: Task = task) =>
  renderWithProviders(
    <ToastProvider>
      <TaskActions task={t} />
    </ToastProvider>,
  );

const open = async () => userEvent.click(screen.getByRole('button', { name: /edit task: send brochure/i }));
const save = async () => userEvent.click(await screen.findByRole('button', { name: /^save$/i }));

describe('TaskActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['tasks.view', 'tasks.edit', 'tasks.delete'];
    (api.get as any).mockResolvedValue({ data: { key: 'x', values: [], data: [] } });
    (api.patch as any).mockResolvedValue({ data: {} });
    (api.delete as any).mockResolvedValue({ data: { success: true } });
  });
  afterEach(() => vi.restoreAllMocks());

  it('offers Edit and Delete to someone who may do both', () => {
    show();
    expect(screen.getByRole('button', { name: /edit task/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete task/i })).toBeInTheDocument();
  });

  it('offers only what the role profile allows', () => {
    permissions = ['tasks.view', 'tasks.edit'];
    const { unmount } = show();
    expect(screen.getByRole('button', { name: /edit task/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete task/i })).not.toBeInTheDocument();
    unmount();

    permissions = ['tasks.view', 'tasks.delete'];
    show();
    expect(screen.queryByRole('button', { name: /edit task/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete task/i })).toBeInTheDocument();
  });

  it('offers nothing to a view-only role', () => {
    permissions = ['tasks.view'];
    show();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the form filled in with the task as it is now', async () => {
    show();
    await open();
    expect(await screen.findByLabelText('Title *')).toHaveValue('Send brochure');
    expect(screen.getByLabelText('Description')).toHaveValue('The 2027 one');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-12-01');
    expect(screen.getByText('Call with Anna')).toBeInTheDocument();
  });

  it('saves a changed title and sends everything else as it was', async () => {
    show();
    await open();
    const title = await screen.findByLabelText('Title *');
    await userEvent.clear(title);
    await userEvent.type(title, 'Send the new brochure');
    await save();
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const [url, body] = (api.patch as any).mock.calls[0];
    expect(url).toBe('/tasks/t1');
    expect(body).toMatchObject({
      title: 'Send the new brochure',
      description: 'The 2027 one',
      dueDate: '2026-12-01',
      personId: 'person-1',
      contactId: 'c1',
    });
  });

  it('can empty the due date, the description and the person', async () => {
    show();
    await open();
    await userEvent.clear(await screen.findByLabelText('Due date'));
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.selectOptions(screen.getByLabelText('Person'), '');
    await save();
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    const body = (api.patch as any).mock.calls[0][1];
    expect(body.dueDate).toBeNull();
    expect(body.description).toBe('');
    expect(body.personId).toBeNull();
  });

  it('removes the link to the contact without losing the task, and can be undone', async () => {
    show();
    await open();
    await userEvent.click(await screen.findByRole('button', { name: /remove link/i }));
    expect(screen.getByText(/will no longer follow up a contact/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.getByText('Call with Anna')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove link/i }));
    await save();
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect((api.patch as any).mock.calls[0][1].contactId).toBeNull();
  });

  it('will not save a task with no title', async () => {
    show();
    await open();
    await userEvent.clear(await screen.findByLabelText('Title *'));
    await save();
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('keeps the form open, with what was typed, and says why when the server refuses', async () => {
    (api.patch as any).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'A task cannot be about a different person than the contact it follows up' } },
    });
    show();
    await open();
    const title = await screen.findByLabelText('Title *');
    await userEvent.clear(title);
    await userEvent.type(title, 'Typed text');
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent(/different person/i);
    expect(screen.getByLabelText('Title *')).toHaveValue('Typed text');
  });

  it('closes the form after a successful save', async () => {
    show();
    await open();
    await save();
    await waitFor(() => expect(screen.queryByLabelText('Title *')).not.toBeInTheDocument());
  });

  it('asks before deleting, and does nothing if the answer is no', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    show();
    await userEvent.click(screen.getByRole('button', { name: /delete task: send brochure/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Send brochure'));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('deletes the task when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();
    await userEvent.click(screen.getByRole('button', { name: /delete task: send brochure/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/tasks/t1'));
  });
});
