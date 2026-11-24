import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageChangeDialog, cleanComment, MAX_COMMENT } from './StageChangeDialog';
import type { ReferenceValue } from '@/types';

const stage = (name: string): ReferenceValue => ({ id: name, name, colour: 'secondary', sortOrder: 0, isActive: true });

function show(props: Partial<React.ComponentProps<typeof StageChangeDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <StageChangeDialog
      open
      dealTitle="Acme ERP License"
      from={stage('Lead')}
      to={stage('Qualified')}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('StageChangeDialog', () => {
  it('shows which deal is moving and between which stages', () => {
    show();
    expect(screen.getByText('Acme ERP License')).toBeInTheDocument();
    const change = screen.getByLabelText('Stage change');
    expect(change).toHaveTextContent('Lead');
    expect(change).toHaveTextContent('Qualified');
  });

  it('will not move the deal without a comment, and says why', async () => {
    const { onConfirm } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Add a comment to explain the move');
    expect(screen.getByLabelText(/why is it moving/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('treats a comment of only spaces and line breaks as empty', async () => {
    const { onConfirm } = show();
    await userEvent.type(screen.getByLabelText(/why is it moving/i), '   {Enter}  ');
    await userEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('passes on the comment, tidied, when there is one', async () => {
    const { onConfirm } = show();
    await userEvent.type(screen.getByLabelText(/why is it moving/i), '  Budget approved  ');
    await userEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    expect(onConfirm).toHaveBeenCalledWith('Budget approved');
  });

  it('lets a comment run to several lines: Enter adds a line, only the button moves the deal', async () => {
    const { onConfirm } = show();
    await userEvent.type(screen.getByLabelText(/why is it moving/i), 'Signed off{Enter}Legal to follow');
    expect(onConfirm).not.toHaveBeenCalled(); // Enter did not submit
    await userEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    expect(onConfirm).toHaveBeenCalledWith('Signed off\nLegal to follow');
  });

  it('cancels without moving anything', async () => {
    const { onConfirm, onCancel } = show();
    await userEvent.type(screen.getByLabelText(/why is it moving/i), 'Changed my mind');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuses a comment over the limit instead of sending it', async () => {
    const { onConfirm } = show();
    const box = screen.getByLabelText(/why is it moving/i);
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(MAX_COMMENT + 1));
    await userEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/under 1000/);
  });

  it('shows what the server said and keeps what was typed when a move is refused', async () => {
    show({ error: 'That deal stage has been retired and cannot be chosen' });
    expect(screen.getByRole('alert')).toHaveTextContent('retired');
  });

  it('locks the buttons while the move is happening', () => {
    show({ submitting: true });
    expect(screen.getByRole('button', { name: 'Moving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('starts empty every time it is opened', async () => {
    const { rerender } = render(
      <StageChangeDialog open dealTitle="A" from={stage('Lead')} to={stage('Won')} onConfirm={() => {}} onCancel={() => {}} />,
    );
    await userEvent.type(screen.getByLabelText(/why is it moving/i), 'left over text');
    rerender(<StageChangeDialog open={false} dealTitle="A" from={stage('Lead')} to={stage('Won')} onConfirm={() => {}} onCancel={() => {}} />);
    rerender(<StageChangeDialog open dealTitle="A" from={stage('Lead')} to={stage('Won')} onConfirm={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/why is it moving/i)).toHaveValue(''));
  });

  it('renders nothing when closed', () => {
    show({ open: false });
    expect(screen.queryByText('Move deal to another stage')).not.toBeInTheDocument();
  });

  it('tidies comments the way the server does', () => {
    expect(cleanComment('  hi  ')).toBe('hi');
    expect(cleanComment(' \n ')).toBe('');
  });
});
