/**
 * Empty out linked lists the user can't view. For example, a company's deals
 * are hidden from someone without "deals.view". Linked record names on a card
 * (a deal's company name, say) are still shown; only full lists are removed.
 */
export function hideUnviewable<T extends object>(
  record: T,
  permissions: string[],
  fields: Partial<Record<keyof T, string>>,
): T {
  const out: any = { ...record };
  for (const [field, permission] of Object.entries(fields)) {
    if (!permissions.includes(permission as string)) out[field] = [];
  }
  return out;
}
