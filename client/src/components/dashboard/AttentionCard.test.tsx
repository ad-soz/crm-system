import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AttentionCard, taskLink } from './AttentionCard';
import { renderWithProviders } from '@/test/utils';
import type { Attention, AttentionTask } from '@/types';

const task = (over: Partial<AttentionTask> = {}): AttentionTask => ({
  id: 't1',
  title: 'Chase invoice',
  dueDate: '2026-11-01T00:00:00.000Z',
  ...over,
});

const attention = (over: Partial<Attention> = {}): Attention => ({
  overdueTasks: { count: 0, items: [] },
  staleDeals: { count: 0, items: [] },
  pastDueDeals: { count: 0, items: [] },
  ...over,
});

describe('AttentionCard', () => {
  it('shows all three lists with names, reasons and links', () => {
    renderWithProviders(
      <AttentionCard
        attention={attention({
          overdueTasks: { count: 1, items: [task({ deal: { id: 'd9', title: 'Acme' } })] },
          staleDeals: { count: 1, items: [{ id: 'd1', title: 'Quiet deal', amount: 12000, quietDays: 23 }] },
          pastDueDeals: { count: 1, items: [{ id: 'd2', title: 'Late deal', amount: 5000, daysLate: 1 }] },
        })}
      />,
    );

    const tasks = screen.getByRole('region', { name: 'Overdue tasks' });
    expect(within(tasks).getByRole('link', { name: 'Chase invoice' })).toHaveAttribute('href', '/deals/d9');
    expect(tasks).toHaveTextContent('Due');

    const quiet = screen.getByRole('region', { name: 'Deals gone quiet' });
    expect(within(quiet).getByRole('link', { name: 'Quiet deal' })).toHaveAttribute('href', '/deals/d1');
    expect(quiet).toHaveTextContent('No contact for 23 days');
    expect(quiet).toHaveTextContent('$12,000');

    const late = screen.getByRole('region', { name: 'Past their close date' });
    expect(within(late).getByRole('link', { name: 'Late deal' })).toHaveAttribute('href', '/deals/d2');
    // Singular reads naturally.
    expect(late).toHaveTextContent('1 day late');
  });

  it('shows the total and says how many more there are beyond the short list', () => {
    renderWithProviders(
      <AttentionCard
        attention={attention({
          overdueTasks: { count: 8, items: [task(), task({ id: 't2', title: 'Second' })] },
        })}
      />,
    );
    expect(screen.getByRole('region', { name: 'Needs your attention' })).toHaveTextContent('8');
    expect(screen.getByText(/and 6 more/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see all tasks/i })).toHaveAttribute('href', '/tasks');
  });

  it('says so, positively, when nothing needs attention', () => {
    renderWithProviders(<AttentionCard attention={attention()} />);
    expect(screen.getByText(/nothing needs your attention/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Overdue tasks' })).not.toBeInTheDocument();
  });

  it('shows a calm line in a list that is empty while others are not', () => {
    renderWithProviders(
      <AttentionCard attention={attention({ staleDeals: { count: 1, items: [{ id: 'd1', title: 'Q', amount: 1, quietDays: 20 }] } })} />,
    );
    expect(screen.getByText('No overdue tasks.')).toBeInTheDocument();
    expect(screen.getByText('No deals past their close date.')).toBeInTheDocument();
  });

  it('leaves out areas the person cannot view', () => {
    renderWithProviders(
      <AttentionCard
        attention={attention({ staleDeals: null, pastDueDeals: null, overdueTasks: { count: 1, items: [task()] } })}
      />,
    );
    expect(screen.getByRole('region', { name: 'Overdue tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Deals gone quiet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Past their close date' })).not.toBeInTheDocument();
  });

  it('renders nothing at all when the person can view none of it', () => {
    const { container } = renderWithProviders(
      <AttentionCard attention={{ overdueTasks: null, staleDeals: null, pastDueDeals: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('links a task to its deal, else its person, else the task list', () => {
    expect(taskLink(task({ deal: { id: 'd', title: 'x' }, person: { id: 'c', firstName: 'a', lastName: 'b' } }))).toBe('/deals/d');
    expect(taskLink(task({ person: { id: 'c', firstName: 'a', lastName: 'b' } }))).toBe('/people/c');
    expect(taskLink(task())).toBe('/tasks');
  });
});
