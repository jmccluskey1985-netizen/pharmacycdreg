import { matchRegister, type RegisterOption } from '@/lib/match';

/**
 * A report's product text ("OXYNORM 5MG HARD CAPS", "METHADONE HCL SF 1MG/ML ORAL SOLN",
 * "Targin 10/5 PR tablets") → the CD book it belongs to, using the same rules as scanning: same
 * drug, same strength, and a brand only ever goes in that brand's book. Null when there's no
 * single book (a product without a book, or more than one to choose from).
 */
export function parseProductText(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(mcg\/hr|mcg\/h|micrograms?\/hour|mg\/ml|mg\/5ml|mcg|micrograms?|mg|g|ml)\b/i);
  if (!m || m.index === undefined) return { name: t, strength: '', form: '' };
  const name = t.slice(0, m.index).replace(/\b(hcl|sf|s\/f|sugar free)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return { name, strength: `${m[1].replace(/\s+/g, '')}${m[2].toLowerCase()}`, form: t.slice(m.index + m[0].length).trim() };
}

export function matchProductText(regs: RegisterOption[], text: string | null | undefined): RegisterOption | null {
  if (!text) return null;
  const { name, strength, form } = parseProductText(text);
  if (!name || !strength) return null;
  const first = name.split(' ')[0];
  const tries: [string, string | null][] = [[first, first], [name, first], [name, null]];
  for (const [n, brand] of tries) {
    const r = matchRegister(regs, n, strength, form || undefined, brand);
    if (r.match) return r.match;
  }
  return null;
}
