import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageBadge, PriorityBadge, StatusBadge, stageLabel } from './display';
import { formatCurrency } from './utils';
import type { ReferenceValue } from '@/types';

const ref = (over: Partial<ReferenceValue>): ReferenceValue => ({
  id: 'x',
  name: 'Name',
  colour: 'secondary',
  sortOrder: 0,
  isActive: true,
  ...over,
});

describe('display helpers', () => {
  it('renders a stage badge from a reference value', () => {
    render(<StageBadge stage={ref({ name: 'Negotiation', colour: 'warning' })} />);
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
  });

  it('renders a priority badge', () => {
    render(<PriorityBadge priority={ref({ name: 'High', colour: 'destructive' })} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders a status badge', () => {
    render(<StatusBadge status={ref({ name: 'In Progress', colour: 'warning' })} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('shows a dash when a value is missing', () => {
    render(<StageBadge stage={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('reads the label off a reference value', () => {
    expect(stageLabel(ref({ name: 'Won' }))).toBe('Won');
    expect(stageLabel(null)).toBe('');
  });

  it('formats currency', () => {
    expect(formatCurrency(75000)).toBe('$75,000');
  });
});
