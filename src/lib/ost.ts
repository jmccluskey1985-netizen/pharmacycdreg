import type { OstExtraction } from './scan-extract';
import { wordsToNumber } from './quantity';

/**
 * HSE Opioid Substitution Treatment (OST) prescriptions: methadone / buprenorphine dispensed in
 * instalments. The pharmacy section of the form has a DATE DISPENSED / QUANTITY grid; each
 * instalment is a supply in the register on the day it's dispensed. Pure functions (unit-tested).
 *
 * - Rows dated today (supervised dose + take-away) become ONE register supply for today.
 * - Earlier rows are history: shown, and flagged if they aren't in the register yet.
 * - Totals are checked: dose × days vs total, words vs figures, dispensed so far vs total.
 */
export const OST_REF_PREFIX = 'OST ';
export const ostRef = (serial: string) => `${OST_REF_PREFIX}${serial.replace(/\s+/g, '')}`;
export const isOstRef = (ref: string | null | undefined) => !!ref && ref.toUpperCase().startsWith(OST_REF_PREFIX);

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export interface OstRow { date: string; quantity: number; mode: 'supervised' | 'take_away' | null; text: string | null }
export interface OstDecision {
  today: { rows: OstRow[]; total: number; breakdown: string | null };
  earlier: OstRow[];
  future: OstRow[];
  dispensedSoFar: number;
  total: number | null;
  remaining: number | null;
  schedule: string;
  flags: string[];
}

const isoDate = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const fmt = (d: string) => d.split('-').reverse().join('/');
const modeLabel = (m: OstRow['mode']) => (m === 'supervised' ? 'supervised' : m === 'take_away' ? 'take-away' : 'dispensed');

/** "Daily", "Mon, Wed, Fri" or "Daily, double on Sat" from the instalment boxes. */
export function scheduleText(o: Pick<OstExtraction, 'instalment_daily' | 'instalment_double_sat' | 'instalment_days' | 'supervised' | 'supervised_daily' | 'supervised_days'>) {
  const collect = o.instalment_double_sat ? 'Daily, double on Sat' : o.instalment_daily ? 'Daily' : o.instalment_days?.length ? WEEKDAYS.filter((d) => o.instalment_days.includes(d)).map((d) => DAY_LABEL[d]).join(', ') : 'Not ticked';
  const sup = o.supervised === false ? 'not supervised' : o.supervised_daily ? 'supervised daily' : o.supervised_days?.length ? `supervised ${WEEKDAYS.filter((d) => o.supervised_days.includes(d)).map((d) => DAY_LABEL[d]).join(', ')}` : o.supervised ? 'supervised' : '';
  return [`Collect: ${collect}`, sup].filter(Boolean).join(' · ');
}

export function decideOst(o: OstExtraction, today: string): OstDecision {
  const rows: OstRow[] = (o.dispensings ?? [])
    .map((d) => ({ date: isoDate(d.date) ?? '', quantity: Number(d.quantity), mode: d.mode ?? null, text: d.quantity_text ?? null }))
    .filter((r) => r.date && Number.isFinite(r.quantity) && r.quantity > 0);
  const flags: string[] = [];
  if ((o.dispensings ?? []).length > rows.length) flags.push('A dispensing row couldn’t be read clearly (date or quantity): check the grid on the form.');

  const todays = rows.filter((r) => r.date === today);
  const earlier = rows.filter((r) => r.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const future = rows.filter((r) => r.date > today);
  if (future.length) flags.push(`A row is dated in the future (${future.map((r) => fmt(r.date)).join(', ')}): check the date.`);
  const todayTotal = todays.reduce((n, r) => n + r.quantity, 0);
  const breakdown = todays.length > 1 || todays.some((r) => r.mode) ? todays.map((r) => `${r.quantity} ${modeLabel(r.mode)}`).join(' + ') : null;

  // Totals
  const figures = o.total_figures ? Number(String(o.total_figures).replace(/[^\d.]/g, '')) : NaN;
  const words = o.total_words ? wordsToNumber(o.total_words) : null;
  const doseTotal = o.daily_dose && o.days_at_dose ? o.daily_dose * o.days_at_dose : null;
  if (Number.isFinite(figures) && words != null && figures !== words) flags.push(`Total in figures (${figures}) and words (${words}) don’t match: check with the prescriber before supplying.`);
  if (doseTotal != null && Number.isFinite(figures) && doseTotal !== figures) flags.push(`${o.daily_dose} a day × ${o.days_at_dose} days = ${doseTotal}, but the total says ${figures}.`);
  if (!o.total_words) flags.push('Total in words is missing.');
  // The legal total: words and figures agree, else the smaller of what's written (never more than prescribed)
  const candidates = [Number.isFinite(figures) ? figures : null, words].filter((n): n is number => n != null && n > 0);
  const total = candidates.length ? Math.min(...candidates) : doseTotal;

  const dispensedSoFar = rows.filter((r) => r.date <= today).reduce((n, r) => n + r.quantity, 0);
  if (total != null && dispensedSoFar > total) flags.push(`Dispensed so far (${dispensedSoFar}) is more than the prescription total (${total}).`);

  // Dates on the script
  const from = isoDate(o.from_date), to = isoDate(o.to_date);
  if (from && today < from) flags.push(`This prescription starts on ${fmt(from)}.`);
  if (to && today > to) flags.push(`This prescription ended on ${fmt(to)}.`);
  if (o.dose_unit && /mg/i.test(o.dose_unit) === false && /ml/i.test(o.dose_unit) === false) flags.push(`Dose unit "${o.dose_unit}": check how much to supply.`);
  if (o.product === 'methadone' && o.drug_written && /mg\s*\/\s*ml/i.test(o.drug_written) && !/\b1\s*mg\s*\/\s*ml/i.test(o.drug_written)) flags.push(`Strength isn’t 1mg/ml (${o.drug_written}): mg and ml are not the same here.`);
  if (o.product === 'methadone' && o.drug_written && !/mg\s*\/\s*ml|dtf|hcl|hydrochloride|oral solution|mixture/i.test(o.drug_written)) flags.push(`Drug written as "${o.drug_written}": form and strength aren’t stated. Check which methadone product to supply.`);
  if (!todays.length) flags.push(`Nothing on this form is dated today (${fmt(today)}). Fill in today’s row on the form, or record it by hand.`);

  return {
    today: { rows: todays, total: todayTotal, breakdown },
    earlier, future, dispensedSoFar, total,
    remaining: total != null ? Math.max(0, total - dispensedSoFar) : null,
    schedule: scheduleText(o),
    flags,
  };
}
