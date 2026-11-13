/** Today's date in Ireland (YYYY-MM-DD), whatever the server's time zone. */
export function irishToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Register entries are expected on the day of the transaction or the next day. Anything
 * older is a "late entry" and must say why (e.g. system down, paper fallback sheet).
 */
export function isLate(transactionDate: string, today = irishToday()): boolean {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return transactionDate < t.toISOString().slice(0, 10);
}

export const LATE_PREFIX = 'Late entry: ';
