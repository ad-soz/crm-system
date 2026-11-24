import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarChart } from './BarChart';

const fmt = (n: number) => `$${n}`;

describe('BarChart', () => {
  it('describes itself in words for screen readers, with every figure', () => {
    render(
      <BarChart
        title="Deals created per month"
        categories={['Sep', 'Oct']}
        series={[{ name: 'Created', values: [15000, 5000], colour: 'primary' }]}
        describe={(n) => `$${n.toLocaleString('en-US')}`}
        format={fmt}
      />,
    );
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('Deals created per month'));
    expect(chart.getAttribute('aria-label')).toContain('Sep: Created $15,000');
    expect(chart.getAttribute('aria-label')).toContain('Oct: Created $5,000');
  });

  it('draws bars in proportion to their values', () => {
    const { container } = render(
      <BarChart title="t" categories={['A', 'B']} series={[{ name: 'S', values: [100, 50], colour: 'primary' }]} format={fmt} />,
    );
    const bars = [...container.querySelectorAll('rect')].map((r) => Number(r.getAttribute('height')));
    expect(bars).toHaveLength(2);
    expect(bars[0]).toBeGreaterThan(0);
    expect(bars[0] / bars[1]).toBeCloseTo(2, 5); // 100 is twice 50
  });

  it('draws one bar per series per category, in theme colours', () => {
    const { container } = render(
      <BarChart
        title="t"
        categories={['A', 'B', 'C']}
        series={[
          { name: 'Won', values: [1, 2, 3], colour: 'success' },
          { name: 'Lost', values: [3, 2, 1], colour: 'destructive' },
        ]}
        format={fmt}
      />,
    );
    const rects = [...container.querySelectorAll('rect')];
    expect(rects).toHaveLength(6);
    expect(rects.filter((r) => r.getAttribute('fill') === 'hsl(var(--success))')).toHaveLength(3);
    expect(rects.filter((r) => r.getAttribute('fill') === 'hsl(var(--destructive))')).toHaveLength(3);
  });

  it('gives each bar hover text naming the month, the series and the value', () => {
    const { container } = render(
      <BarChart title="t" categories={['Sep']} series={[{ name: 'Won', values: [3000], colour: 'success' }]} format={fmt} />,
    );
    expect(container.querySelector('rect title')!.textContent).toBe('Sep, Won: $3000');
  });

  it('shows a legend only when there is more than one series', () => {
    const one = render(<BarChart title="t" categories={['A']} series={[{ name: 'Only', values: [1], colour: 'primary' }]} format={fmt} />);
    expect(one.container.querySelector('ul')).toBeNull();
    one.unmount();
    const two = render(
      <BarChart
        title="t"
        categories={['A']}
        series={[
          { name: 'Won', values: [1], colour: 'success' },
          { name: 'Lost', values: [1], colour: 'destructive' },
        ]}
        format={fmt}
      />,
    );
    expect(two.container.querySelectorAll('li')).toHaveLength(2);
  });

  it('never draws an empty frame: it says there is nothing to show', () => {
    render(<BarChart title="Won and lost per month" categories={['A', 'B']} series={[{ name: 'Won', values: [0, 0], colour: 'success' }]} format={fmt} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Won and lost per month: nothing to show for this period.');
  });

  it('labels the axis with tidy round numbers', () => {
    const { container } = render(
      <BarChart title="t" categories={['A']} series={[{ name: 'S', values: [23000], colour: 'primary' }]} />,
    );
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toContain('$0');
    expect(labels).toContain('$50k'); // 23,000 rounds the top up to 50,000
    expect(labels).toContain('A');
  });
});
