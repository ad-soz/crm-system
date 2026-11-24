import { describe, it, expect } from 'vitest';
import { forecastHint, forecastLabel, weightedShare } from './forecast';
import type { ForecastRow } from '@/types';

const row = (over: Partial<ForecastRow>): ForecastRow => ({
  key: '2026-11',
  kind: 'month',
  count: 1,
  value: 100,
  weighted: 50,
  ...over,
});

describe('forecast labels', () => {
  it('names months in full', () => {
    expect(forecastLabel(row({ key: '2026-11' }))).toBe('November 2026');
    expect(forecastLabel(row({ key: '2027-01' }))).toBe('January 2027');
  });

  it('does not let the viewer time zone move a month', () => {
    // 1 December at midnight UTC is still December in every time zone label.
    expect(forecastLabel(row({ key: '2026-12' }))).toBe('December 2026');
  });

  it('names the special rows', () => {
    expect(forecastLabel(row({ key: 'overdue', kind: 'overdue' }))).toBe('Overdue');
    expect(forecastLabel(row({ key: 'none', kind: 'none' }))).toBe('No close date');
  });

  it('explains the special rows but not ordinary months', () => {
    expect(forecastHint(row({ kind: 'overdue' }))).toMatch(/has passed/);
    expect(forecastHint(row({ kind: 'none' }))).toMatch(/Add an expected close date/);
    expect(forecastHint(row({ kind: 'month' }))).toBeNull();
  });

  it('works out the weighted share safely', () => {
    expect(weightedShare(57750, 90000)).toBe(64);
    expect(weightedShare(0, 0)).toBe(0);
  });
});
