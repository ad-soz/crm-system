import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyForm } from './CompanyForm';
import { renderWithProviders } from '@/test/utils';

// The form reads the industries list and the single/multiple setting.
vi.mock('@/hooks/queries', () => ({
  useActiveReferenceValues: vi.fn(),
  useReferenceCatalog: vi.fn(),
}));

import { useActiveReferenceValues, useReferenceCatalog } from '@/hooks/queries';

const industries = [
  { id: 'ind-tech', name: 'Technology', colour: 'info', sortOrder: 0, isActive: true },
  { id: 'ind-saas', name: 'SaaS', colour: 'default', sortOrder: 1, isActive: true },
];

function setAllowMultiple(allowMultiple: boolean) {
  (useActiveReferenceValues as any).mockReturnValue({ values: industries });
  (useReferenceCatalog as any).mockReturnValue({
    data: { lists: [{ key: 'industries', multiField: 'company.industry', allowMultiple }] },
  });
}

describe('CompanyForm', () => {
  beforeEach(() => setAllowMultiple(false));

  it('validates the required name field', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<CompanyForm onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the name and a single chosen industry', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<CompanyForm onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText('Name *'), 'Acme Corp');
    // Single-choice mode shows a dropdown labelled "Industry".
    await userEvent.selectOptions(screen.getByLabelText('Industry'), 'ind-tech');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Acme Corp', industryIds: ['ind-tech'] });
  });

  it('allows several industries when multiple selection is on', async () => {
    setAllowMultiple(true);
    const onSubmit = vi.fn();
    renderWithProviders(<CompanyForm onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText('Name *'), 'Acme Corp');
    await userEvent.click(screen.getByLabelText('Technology'));
    await userEvent.click(screen.getByLabelText('SaaS'));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].industryIds).toEqual(['ind-tech', 'ind-saas']);
  });
});
