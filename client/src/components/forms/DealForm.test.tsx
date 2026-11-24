import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealForm } from './DealForm';
import { renderWithProviders } from '@/test/utils';
import type { Deal } from '@/types';

vi.mock('@/hooks/queries', () => ({
  useAllCompanies: () => ({ data: [] }),
  useAllPeople: () => ({ data: [] }),
  useActiveReferenceValues: () => ({
    values: [
      { id: 'stage-lead', name: 'Lead', colour: 'secondary', sortOrder: 0, isActive: true },
      { id: 'stage-qualified', name: 'Qualified', colour: 'info', sortOrder: 1, isActive: true },
    ],
  }),
}));

const existing = { id: 'd1', title: 'Acme ERP', amount: 5000, stageId: 'stage-lead' } as Partial<Deal>;

function show(initial?: Partial<Deal>) {
  const onSubmit = vi.fn();
  renderWithProviders(<DealForm initial={initial} onSubmit={onSubmit} onCancel={() => {}} />);
  return onSubmit;
}

describe('DealForm and stage changes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not ask for a reason when the stage has not changed', async () => {
    const onSubmit = show(existing);
    expect(screen.queryByLabelText(/why is it moving/i)).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Title *'));
    await userEvent.type(screen.getByLabelText('Title *'), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Renamed', stageComment: undefined });
  });

  it('asks for a reason as soon as a different stage is chosen', async () => {
    show(existing);
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-qualified');
    expect(await screen.findByLabelText(/why is it moving/i)).toBeInTheDocument();
  });

  it('will not save a stage change without the reason', async () => {
    const onSubmit = show(existing);
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-qualified');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/add a comment/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('will not accept a reason of only spaces', async () => {
    const onSubmit = show(existing);
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-qualified');
    await userEvent.type(screen.getByLabelText(/why is it moving/i), '    ');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the new stage together with the reason', async () => {
    const onSubmit = show(existing);
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-qualified');
    await userEvent.type(screen.getByLabelText(/why is it moving/i), '  Discovery call went well ');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ stageId: 'stage-qualified', stageComment: 'Discovery call went well' });
  });

  it('forgets the reason if the stage is put back, rather than sending a stray comment', async () => {
    const onSubmit = show(existing);
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-qualified');
    await userEvent.type(screen.getByLabelText(/why is it moving/i), 'Changed my mind soon after');
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-lead');
    expect(screen.queryByLabelText(/why is it moving/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].stageComment).toBeUndefined();
  });

  it('does not ask for a reason when creating a new deal', async () => {
    const onSubmit = show(undefined);
    await userEvent.type(screen.getByLabelText('Title *'), 'Brand new');
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'stage-qualified');
    expect(screen.queryByLabelText(/why is it moving/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Brand new', stageId: 'stage-qualified' });
  });
});
