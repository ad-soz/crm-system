import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Account from './Account';
import { renderWithProviders } from '@/test/utils';
import { api } from '@/lib/api';

const setSession = vi.fn();
let currentUser: any = { id: 'u1', email: 'a@b.com', mustChangePassword: true };

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, setSession, logout: vi.fn() }),
}));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: vi.fn() } };
});

async function fill(current: string, next: string, confirm = next) {
  await userEvent.type(screen.getByLabelText(/temporary password|current password/i), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('Account page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: 'u1', email: 'a@b.com', mustChangePassword: true };
  });

  it('explains why a temporary password must be changed', () => {
    renderWithProviders(<Account />);
    expect(screen.getByRole('alert')).toHaveTextContent(/temporary password/i);
  });

  it('validates length and matching confirmation before calling the API', async () => {
    renderWithProviders(<Account />);
    await fill('temp-pass', 'short');
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.type(screen.getByLabelText('New password'), 'long-enough-password');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('changes the password and stores the new session', async () => {
    (api.post as any).mockResolvedValue({
      data: { accessToken: 'new-token', user: { id: 'u1', mustChangePassword: false } },
    });
    renderWithProviders(<Account />);
    await fill('temp-pass', 'a-long-new-password');

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'temp-pass',
        newPassword: 'a-long-new-password',
      }),
    );
    expect(setSession).toHaveBeenCalledWith('new-token', { id: 'u1', mustChangePassword: false });
  });

  it('shows the server error when the current password is wrong', async () => {
    (api.post as any).mockRejectedValue(new Error('Your current password is incorrect'));
    renderWithProviders(<Account />);
    await fill('wrong', 'a-long-new-password');
    expect(await screen.findByText('Your current password is incorrect')).toBeInTheDocument();
  });
});
