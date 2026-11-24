import { describe, it, expect } from 'vitest';
import { compactCurrency, formatDays, monthLabel, niceCeil, shortMonthLabel } from './reports';

describe('report formatting', () => {
  it('names months without time zone surprises', () => {
    expect(monthLabel('2026-01')).toBe('Jan 2026');
    expect(monthLabel('2026-12')).toBe('Dec 2026');
    expect(monthLabel('nonsense')).toBe('nonsense');
    expect(monthLabel('2026-13')).toBe('2026-13');
  });

  it('adds the year to a short label only when the year changes', () => {
    expect(shortMonthLabel('2026-11')).toBe('Nov 26');
    expect(shortMonthLabel('2026-12', '2026-11')).toBe('Dec');
    expect(shortMonthLabel('2027-01', '2026-12')).toBe('Jan 27');
  });

  it('says how long in plain words', () => {
    expect(formatDays(0)).toBe('today');
    expect(formatDays(-3)).toBe('today');
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(40)).toBe('40 days');
  });

  it('shortens money for axes', () => {
    expect(compactCurrency(0)).toBe('$0');
    expect(compactCurrency(950)).toBe('$950');
    expect(compactCurrency(1000)).toBe('$1k');
    expect(compactCurrency(12500)).toBe('$12.5k');
    expect(compactCurrency(3_200_000)).toBe('$3.2M');
  });

  it('rounds a chart top up to a tidy number', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(23000)).toBe(50000);
    expect(niceCeil(20000)).toBe(20000);
    expect(niceCeil(120000)).toBe(200000);
    expect(niceCeil(0.3)).toBe(0.5);
  });
});
