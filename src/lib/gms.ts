/**
 * HSE "List of GPs on the GMS Scheme" (published 14 October 2026), parsed into
 * name / practice address / GMS number / area. Public data. Used as a national
 * fallback for prescriber quick-fill; the pharmacy's own list and register history
 * come first. The original line is kept (raw) so the pharmacist can check the split.
 * Refresh: re-run the parser on the new HSE list and replace src/data/gms-gps.json.
 */
import data from '@/data/gms-gps.json';

export interface GmsGp { g: string; n: string; a: string | null; r: string | null; raw: string }
const LIST = data as GmsGp[];
export const GMS_LIST_DATE = '14 October 2026';

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const INDEX = LIST.map((x) => ({ x, key: norm(`${x.n} ${x.a ?? ''} ${x.r ?? ''}`), name: norm(x.n) }));

/** Every query word must appear; GMS number matches by prefix. Name matches rank first. */
export function searchGms(q: string, limit = 8): GmsGp[] {
  const words = norm(q.replace(/^dr\.?\s*/i, '')).split(' ').filter(Boolean);
  if (!words.length) return [];
  if (/^\d{3,}$/.test(words[0])) return LIST.filter((x) => x.g.startsWith(words[0])).slice(0, limit);
  const hits = INDEX.filter((i) => words.every((w) => i.key.includes(w)));
  hits.sort((a, b) => Number(!words.every((w) => b.name.includes(w))) - Number(!words.every((w) => a.name.includes(w))));
  return hits.slice(0, limit).map((h) => h.x);
}
