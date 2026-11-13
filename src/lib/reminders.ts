import { z } from 'zod';

export const FREQUENCIES = {
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Every 2 weeks',
  four_weekly: 'Every 4 weeks',
  monthly: 'Monthly',
  custom: 'Every … days',
} as const;
export type Frequency = keyof typeof FREQUENCIES;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

/** One period on from `from` (YYYY-MM-DD). Monthly keeps the day, clamped to the month's end. */
export function addPeriod(from: string, f: Frequency, days?: number | null): string {
  const d = parse(from);
  if (f === 'monthly') {
    const day = d.getUTCDate();
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
    m.setUTCDate(Math.min(day, last));
    return iso(m);
  }
  const step = { daily: 1, weekly: 7, fortnightly: 14, four_weekly: 28, custom: Math.max(1, days ?? 7) }[f];
  d.setUTCDate(d.getUTCDate() + step);
  return iso(d);
}

/** Next due date after recording (or skipping) the one due on `due`: always after today. */
export function advance(due: string, f: Frequency, days: number | null | undefined, today: string): string {
  let next = addPeriod(due, f, days);
  for (let i = 0; next <= today && i < 1000; i++) next = addPeriod(next, f, days);
  return next;
}

export function describe(f: Frequency, days?: number | null) {
  return f === 'custom' ? `Every ${days ?? '?'} days` : FREQUENCIES[f];
}

const opt = z.string().trim().max(300).optional().nullable();
export const ReminderLine = z.object({
  register_id: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100000),
  recipient_name: z.string().trim().min(2).max(200),
  recipient_address: z.string().trim().min(3).max(300),
  prescriber_name: opt,
  prescriber_address: opt,
  authority_to_possess: opt,
  patient_id: z.string().uuid().optional().nullable(),
});
export const ReminderBody = z.object({
  title: z.string().trim().min(2).max(120),
  frequency: z.enum(['daily', 'weekly', 'fortnightly', 'four_weekly', 'monthly', 'custom']),
  interval_days: z.coerce.number().int().min(1).max(366).optional().nullable(),
  next_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(ReminderLine).min(1, 'Add at least one supply').max(30),
  notes: z.string().trim().max(1000).optional().nullable(),
  active: z.boolean().optional(),
});
