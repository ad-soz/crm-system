/**
 * What "today" means for due dates and close dates.
 *
 * A date picked in the app is stored as midnight UTC of that calendar date.
 * So "today" must be the *local* calendar date of the person (the server runs
 * on their own computer) written the same way. Comparing against the current
 * clock time instead would treat a task due today as already late from one
 * second after midnight, and comparing against the UTC date would roll over
 * mid-evening in the Americas.
 */
export function startOfToday(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}
