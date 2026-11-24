import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { RequirePermission } from './RequirePermission';

let currentUser: any;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));

const userWith = (permissions: string[]) => ({
  id: 'u1',
  firstName: 'Pat',
  lastName: 'Lee',
  email: 'p@l.com',
  permissions,
});

describe('navigation follows permissions', () => {
  it('shows only the areas the role profile can view', () => {
    currentUser = userWith(['people.view', 'tasks.view']);
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveTextContent('People');
    expect(nav).toHaveTextContent('Tasks');
    expect(nav).not.toHaveTextContent('Deals');
    expect(nav).not.toHaveTextContent('Companies');
    expect(nav).not.toHaveTextContent('Contacts');
    // Reports are about deals, so they follow deal access.
    expect(nav).not.toHaveTextContent('Reports');
    // Always available.
    expect(nav).toHaveTextContent('Dashboard');
    expect(nav).toHaveTextContent('Settings');
    // Appearance is a card inside Settings now, not a menu item.
    expect(nav).not.toHaveTextContent('Appearance');
  });
});

it('shows Reports, between Deals and Tasks, to someone who can view deals', () => {
  currentUser = userWith(['deals.view', 'tasks.view']);
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
  const links = screen.getAllByRole('link').map((a) => a.textContent);
  expect(links).toEqual(expect.arrayContaining(['Deals', 'Reports', 'Tasks']));
  expect(links.indexOf('Deals')).toBeLessThan(links.indexOf('Reports'));
  expect(links.indexOf('Reports')).toBeLessThan(links.indexOf('Tasks'));
});

describe('RequirePermission', () => {
  it('shows the page with the permission', () => {
    currentUser = userWith(['deals.view']);
    render(
      <RequirePermission permission="deals.view">
        <div>Deals page</div>
      </RequirePermission>,
    );
    expect(screen.getByText('Deals page')).toBeInTheDocument();
  });

  it('explains the missing access instead of showing the page', () => {
    currentUser = userWith(['people.view']);
    render(
      <RequirePermission permission="deals.view">
        <div>Deals page</div>
      </RequirePermission>,
    );
    expect(screen.queryByText('Deals page')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/don't have access/i);
  });
});
