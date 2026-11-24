/**
 * "Needs attention": the deals that are slipping for one person.
 *
 *  - Stale deals: open deals the person owns with no contact in the last
 *    STALE_DAYS days, logged on the deal itself or on its person. A deal
 *    younger than that can't be stale yet, so a brand new deal isn't flagged.
 *  - Past-due deals: open deals the person owns whose expected close date is
 *    before today (see startOfToday: close dates are stored as UTC midnight).
 *
 * The caller passes open deals only; everything here is plain calculation so
 * it can be tested against hand-made data.
 */

import { startOfToday } from './dates';

export const STALE_DAYS = 14;
export const MAX_ITEMS = 5;

export interface AttentionDeal {
  id: string;
  title: string;
  amount: number;
  ownerId: string | null;
  personId: string | null;
  createdAt: Date;
  expectedCloseDate: Date | null;
}

export interface DealAttentionItem {
  id: string;
  title: string;
  amount: number;
  /** Whole days since the last contact (or since creation if there was none). */
  quietDays?: number;
  /** Whole days past the expected close date. */
  daysLate?: number;
}

export interface Section<T> {
  count: number;
  items: T[];
}

const DAY = 24 * 60 * 60 * 1000;

export function buildDealAttention(
  deals: AttentionDeal[],
  userId: string,
  lastByDeal: Map<string, Date>,
  lastByPerson: Map<string, Date>,
  now: Date = new Date(),
): { staleDeals: Section<DealAttentionItem>; pastDueDeals: Section<DealAttentionItem> } {
  const today = startOfToday(now);
  const stale: DealAttentionItem[] = [];
  const pastDue: DealAttentionItem[] = [];

  for (const deal of deals) {
    if (deal.ownerId !== userId) continue;

    // The most recent sign of life: a contact on the deal or on its person,
    // or when the deal was created.
    const times = [deal.createdAt.getTime()];
    const onDeal = lastByDeal.get(deal.id);
    if (onDeal) times.push(onDeal.getTime());
    const onPerson = deal.personId ? lastByPerson.get(deal.personId) : undefined;
    if (onPerson) times.push(onPerson.getTime());
    const quietDays = Math.floor((now.getTime() - Math.max(...times)) / DAY);

    if (quietDays >= STALE_DAYS) {
      stale.push({ id: deal.id, title: deal.title, amount: deal.amount, quietDays });
    }

    if (deal.expectedCloseDate && deal.expectedCloseDate.getTime() < today) {
      const daysLate = Math.floor((today - deal.expectedCloseDate.getTime()) / DAY);
      pastDue.push({ id: deal.id, title: deal.title, amount: deal.amount, daysLate });
    }
  }

  // Worst first: quietest, then furthest past due.
  stale.sort((a, b) => (b.quietDays ?? 0) - (a.quietDays ?? 0) || b.amount - a.amount);
  pastDue.sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0) || b.amount - a.amount);

  return {
    staleDeals: { count: stale.length, items: stale.slice(0, MAX_ITEMS) },
    pastDueDeals: { count: pastDue.length, items: pastDue.slice(0, MAX_ITEMS) },
  };
}
