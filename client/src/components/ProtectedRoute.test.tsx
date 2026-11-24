import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthProvider } from '@/context/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { api, TOKEN_KEY } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { get: vi.fn() },
  };
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('redirects to login when there is no token', async () => {
    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Secret</div></ProtectedRoute>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', async () => {
    localStorage.setItem(TOKEN_KEY, 'valid-token');
    (api.get as any).mockResolvedValue({
      data: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B', permissions: ['people.view'] },
    });

    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Secret</div></ProtectedRoute>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Secret')).toBeInTheDocument());
  });

  it('sends someone with a temporary password to the account page', async () => {
    localStorage.setItem(TOKEN_KEY, 'valid-token');
    (api.get as any).mockResolvedValue({
      data: { id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B', permissions: [], mustChangePassword: true },
    });

    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Secret</div></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><div>Account Page</div></ProtectedRoute>} />
        </Routes>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Account Page')).toBeInTheDocument());
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });
});
