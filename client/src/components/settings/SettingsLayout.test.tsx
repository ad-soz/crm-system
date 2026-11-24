import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SettingsLayout } from './SettingsLayout';
import { SETTINGS_SECTIONS, visibleSections } from './settingsSections';
import { RequirePermission } from '@/components/RequirePermission';

let permissions: string[] = [];
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', permissions } }),
}));

const ADMIN = [
  'users.manage',
  'audit.view',
  'profiles.manage',
  'reference.manage',
  'backups.manage',
  'datamodel.view',
  'appearance.manage',
];

// The same shape as the real routes, with a marker in place of each page.
function renderAt(path: string) {
  const page = (name: string) => <div>{`page: ${name}`}</div>;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={page('profile')} />
          <Route path="appearance" element={page('appearance')} />
          <Route path="users" element={<RequirePermission permission="users.manage">{page('users')}</RequirePermission>} />
          <Route path="roles" element={<RequirePermission permission="profiles.manage">{page('roles')}</RequirePermission>} />
          <Route path="backups" element={<RequirePermission permission="backups.manage">{page('backups')}</RequirePermission>} />
          <Route path="*" element={<Navigate to="profile" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const menu = () => screen.getByRole('navigation', { name: 'Settings sections' });

describe('Settings menu', () => {
  beforeEach(() => {
    permissions = [];
  });

  it('gives an ordinary user just their own two pages', () => {
    renderAt('/settings');
    expect(within(menu()).getAllByRole('link').map((a) => a.textContent)).toEqual(['My details', 'Appearance']);
    expect(within(menu()).getByText('You')).toBeInTheDocument();
    // No empty headings for groups they cannot use.
    expect(within(menu()).queryByText('Organisation')).not.toBeInTheDocument();
    expect(within(menu()).queryByText('Advanced')).not.toBeInTheDocument();
  });

  it('shows an administrator every page, in three groups', () => {
    permissions = ADMIN;
    renderAt('/settings');
    expect(within(menu()).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'My details',
      'Appearance',
      'Users',
      'Role profiles',
      'Reference lists',
      'Backups',
      'Audit log',
      'Data model',
    ]);
    for (const heading of ['You', 'Organisation', 'Advanced']) {
      expect(within(menu()).getByText(heading)).toBeInTheDocument();
    }
  });

  it('shows the audit log to someone allowed to see it', () => {
    permissions = ['audit.view'];
    renderAt('/settings');
    expect(within(menu()).getAllByRole('link').map((a) => a.textContent)).toEqual(['My details', 'Appearance', 'Audit log']);
  });

  it('does not show the audit log to someone who manages users but may not see it', () => {
    permissions = ['users.manage'];
    renderAt('/settings');
    expect(within(menu()).queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
  });

  it('shows only the organisation pages a person has permission for', () => {
    permissions = ['backups.manage'];
    renderAt('/settings');
    expect(within(menu()).getAllByRole('link').map((a) => a.textContent)).toEqual(['My details', 'Appearance', 'Backups']);
  });

  it('opens on My details', () => {
    renderAt('/settings');
    expect(screen.getByText('page: profile')).toBeInTheDocument();
  });

  it('shows one section at a time, and marks the current one', async () => {
    permissions = ADMIN;
    renderAt('/settings/profile');
    await userEvent.click(within(menu()).getByRole('link', { name: 'Backups' }));
    expect(screen.getByText('page: backups')).toBeInTheDocument();
    expect(screen.queryByText('page: profile')).not.toBeInTheDocument();
    expect(within(menu()).getByRole('link', { name: 'Backups' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu()).getByRole('link', { name: 'My details' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the whole menu on screen while moving between sections', async () => {
    permissions = ADMIN;
    renderAt('/settings/users');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(within(menu()).getByRole('link', { name: 'Role profiles' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('page: roles')).toBeInTheDocument();
  });

  it('explains instead of showing a page the person has no permission for', () => {
    renderAt('/settings/users');
    expect(screen.queryByText('page: users')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/don't have access/i);
  });

  it('sends an unknown settings address back to My details', () => {
    renderAt('/settings/does-not-exist');
    expect(screen.getByText('page: profile')).toBeInTheDocument();
  });
});

describe('Settings sections list', () => {
  it('has a unique address and a label for every section', () => {
    const paths = SETTINGS_SECTIONS.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(SETTINGS_SECTIONS.every((s) => s.label && s.description)).toBe(true);
  });

  it('only asks for permissions that exist', () => {
    const known = new Set(ADMIN);
    for (const s of SETTINGS_SECTIONS) if (s.permission) expect(known.has(s.permission)).toBe(true);
  });

  it('hides everything that needs a permission from someone with none', () => {
    const all = visibleSections(() => false).flatMap((g) => g.items.map((i) => i.path));
    expect(all).toEqual(['profile', 'appearance']);
  });
});
