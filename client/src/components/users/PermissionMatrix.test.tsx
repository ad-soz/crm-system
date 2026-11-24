import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionMatrix } from './PermissionMatrix';
import { summarize } from './RoleProfilesSection';
import type { PermissionCatalog, RoleProfile } from '@/types';

const catalog: PermissionCatalog = {
  areas: ['people', 'deals'].map((key) => ({
    key,
    label: key[0].toUpperCase() + key.slice(1),
    permissions: (['view', 'create', 'edit', 'delete'] as const).map((action) => ({ key: `${key}.${action}`, action })),
  })),
  admin: [
    { key: 'users.manage', label: 'Manage users', description: 'Invite people' },
    { key: 'datamodel.view', label: 'View data model', description: 'See the diagram' },
    { key: 'datamodel.edit', label: 'Edit data model', description: 'Change the structure' },
  ],
};

function Harness({ initial = [], grantable, onChange }: { initial?: string[]; grantable?: string[]; onChange?: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <PermissionMatrix
      catalog={catalog}
      value={value}
      grantable={grantable}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('PermissionMatrix', () => {
  it('turning on edit also turns on view, and view then stays on', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Deals: Edit'));

    expect(onChange.mock.lastCall![0]).toEqual(expect.arrayContaining(['deals.edit', 'deals.view']));
    const view = screen.getByLabelText('Deals: View');
    expect(view).toBeChecked();
    expect(view).toBeDisabled();
  });

  it('lets view be turned off again once nothing else needs it', async () => {
    render(<Harness initial={['people.view']} />);
    const view = screen.getByLabelText('People: View');
    expect(view).toBeEnabled();
    await userEvent.click(view);
    expect(view).not.toBeChecked();
  });

  it('turning on edit data model also turns on view data model', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText(/Edit data model/));
    expect(screen.getByLabelText(/View data model/)).toBeChecked();
    expect(screen.getByLabelText(/View data model/)).toBeDisabled();
  });

  it('only lets you tick permissions you hold yourself', () => {
    render(<Harness grantable={['people.view']} />);
    expect(screen.getByLabelText('People: View')).toBeEnabled();
    expect(screen.getByLabelText('People: Delete')).toBeDisabled();
    expect(screen.getByLabelText(/Manage users/)).toBeDisabled();
    expect(screen.getByText(/only give permissions that your own profile has/i)).toBeInTheDocument();
  });
});

describe('summarize', () => {
  const profile = (permissions: string[]): RoleProfile => ({
    id: 'p', name: 'P', description: null, isSystem: false, permissions, userCount: 0,
  });

  it('describes access in words', () => {
    expect(summarize(profile([]), catalog)).toBe('No access');
    expect(summarize(profile(['people.view']), catalog)).toBe('People (view)');
    expect(
      summarize(profile(['people.view', 'people.create', 'people.edit', 'people.delete', 'users.manage']), catalog),
    ).toBe('People · Manage users');
  });
});
