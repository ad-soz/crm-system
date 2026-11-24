import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { renderWithProviders } from '@/test/utils';

const loginMock = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: loginMock }),
}));

describe('Login form', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('renders email and password fields', () => {
    renderWithProviders(<Login />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('shows a validation error for an invalid email', async () => {
    renderWithProviders(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Enter a valid email')).toBeInTheDocument());
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('calls login with valid credentials', async () => {
    loginMock.mockResolvedValue(undefined);
    renderWithProviders(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'user@test.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('user@test.com', 'password123'));
  });

  it('shows a server error on failed login', async () => {
    loginMock.mockRejectedValue(new Error('Invalid credentials'));
    renderWithProviders(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'user@test.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });
});
