/**
 * Weighted sales forecast.
 *
 * Each open deal is worth its amount times the win chance of the stage it is
 * in (e.g. a $10,000 deal in a 25% stage is worth $2,500). Deals are grouped by
 * the month they are expected to close, with two special groups so nothing is
 * hidden: "overdue" (the close date has passed) and "none" (no close date).
 *
 * Dates are stored as UTC midnight (that is what a date picker produces), so
 * the month a deal falls in is read in UTC, and "today" comes from
 * startOfToday() (the local calendar date written the same way).
 */
import { startOfToday } from './dates';

export interface ForecastDeal {
  amount: number;
  expectedCloseDate: Date | null;
  stageId: string;
}

export interface ForecastRow {
  /** 'overdue', 'none', or a month as 'YYYY-MM'. */
  key: string;
  kind: 'overdue' | 'month' | 'none';
  count: number;
  /** Sum of amounts. */
  value: number;
  /** Sum of amount x win chance. */
  weighted: number;
}

export interface Forecast {
  count: number;
  total: number;
  weighted: number;
  rows: ForecastRow[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param deals    open deals only (the caller decides what "open" means)
 * @param chances  win chance 0..100 per stage id; a stage with no entry counts as 0
 */
export function buildForecast(deals: ForecastDeal[], chances: Map<string, number>, now: Date = new Date()): Forecast {
  const today = startOfToday(now);
  const groups = new Map<string, ForecastRow>();

  const add = (key: string, kind: ForecastRow['kind'], amount: number, weighted: number) => {
    const row = groups.get(key) ?? { key, kind, count: 0, value: 0, weighted: 0 };
    row.count += 1;
    row.value += amount;
    row.weighted += weighted;
    groups.set(key, row);
  };

  let total = 0;
  let weighted = 0;
  for (const deal of deals) {
    const amount = Number.isFinite(deal.amount) ? deal.amount : 0;
    // Clamp so a bad value can never inflate the forecast.
    const chance = Math.min(100, Math.max(0, chances.get(deal.stageId) ?? 0));
    const worth = (amount * chance) / 100;
    total += amount;
    weighted += worth;

    if (!deal.expectedCloseDate) add('none', 'none', amount, worth);
    else if (deal.expectedCloseDate.getTime() < today) add('overdue', 'overdue', amount, worth);
    else add(monthKey(deal.expectedCloseDate), 'month', amount, worth);
  }

  // Overdue first (needs attention), then months in order, then deals with no date.
  const order = (r: ForecastRow) => (r.kind === 'overdue' ? 0 : r.kind === 'month' ? 1 : 2);
  const rows = [...groups.values()]
    .map((r) => ({ ...r, value: cents(r.value), weighted: cents(r.weighted) }))
    .sort((a, b) => order(a) - order(b) || a.key.localeCompare(b.key));

  return { count: deals.length, total: cents(total), weighted: cents(weighted), rows };
}
