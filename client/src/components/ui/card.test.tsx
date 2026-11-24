import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './card';
import { Notice } from './notice';
import { Table, TableBody, TableCell, TableRow } from './table';
import { Dialog } from './dialog';

const hasGlow = (el: Element | null) => !!el?.classList.contains('glow');

describe('shared surfaces', () => {
  it('a Card glows and follows the Corners setting', () => {
    render(<Card data-testid="c">x</Card>);
    const card = screen.getByTestId('c');
    expect(hasGlow(card)).toBe(true);
    // rounded-lg is tied to --radius; a fixed size such as rounded-xl would ignore Corners.
    expect(card.className).toContain('rounded-lg');
    expect(card.className).not.toContain('rounded-xl');
  });

  it('a flat Card has no glow or shadow, for use inside another card', () => {
    render(<Card flat data-testid="c">x</Card>);
    const card = screen.getByTestId('c');
    expect(hasGlow(card)).toBe(false);
    expect(card.classList.contains('shadow')).toBe(false);
  });

  it('a Table draws its own glowing surface, or a flat one when asked', () => {
    const rows = (
      <TableBody>
        <TableRow>
          <TableCell>cell</TableCell>
        </TableRow>
      </TableBody>
    );
    const { container, rerender } = render(<Table>{rows}</Table>);
    expect(hasGlow(container.firstElementChild)).toBe(true);
    rerender(<Table flat>{rows}</Table>);
    expect(hasGlow(container.firstElementChild)).toBe(false);
  });

  it('a Notice is a flat Card with a tone', () => {
    render(<Notice tone="error" data-testid="n">oops</Notice>);
    const n = screen.getByTestId('n');
    expect(hasGlow(n)).toBe(false);
    expect(n.className).toContain('text-destructive');
  });

  it('a Dialog panel glows', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <p>inside</p>
      </Dialog>,
    );
    expect(hasGlow(screen.getByText('inside').parentElement)).toBe(true);
  });
});
