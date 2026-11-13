/**
 * Invoice / CD-docket rules. The reader reports what is printed; these rules check it
 * against how Irish wholesaler paperwork is laid out, so the register gets the right
 * supplier, the INVOICE number (never the account number) and units, not packs.
 *
 * Layouts learnt from real documents:
 *  - Uniphar invoice: INVOICE | ACCOUNT | PRINT DATE … headers; QTY (packs) on the left,
 *    PACK size in its own column on the right; pharmacy company ("… Ltd TA …") top-left.
 *  - Uniphar CD docket (SF-01-216): NUMBER = docket/invoice no., ACCOUNT = "M",
 *    Quantity (packs) + Packsize columns; supplier only in the footer / "return to UNIPHAR".
 *  - PCO invoice / MDA receipt: INVOICE / Invoice No (e.g. E402886); Account, Shop Ref,
 *    Reference are not the invoice; pack size at the end of the description ("TABS 56").
 */

export interface KnownSupplier { key: string; name: string; address: string | null; match: RegExp }

// Irish CD suppliers offered in quick-fill. Addresses only where confirmed from the
// supplier's own paperwork; otherwise the pharmacy types it once and it's remembered.
export const KNOWN_SUPPLIERS: KnownSupplier[] = [
  { key: 'uniphar', name: 'Uniphar Wholesale', address: '4045 Kingswood Road, Citywest Business Park, Co. Dublin', match: /uniphar/i },
  { key: 'united', name: 'United Drug', address: null, match: /united drug/i },
  { key: 'pco', name: 'PCO Manufacturing Ltd', address: 'Unit 10 Ashbourne Business Park, Rath, Ashbourne, Co. Meath, A84 WR60', match: /\bpco\b|pco\.ie|pco manufacturing/i },
  { key: 'imed', name: 'IMED Healthcare', address: null, match: /\bimed\b/i },
  { key: 'pluripharm', name: 'Pluripharm', address: null, match: /pluri ?pharm/i },
];

export function identifySupplier(...texts: (string | null | undefined)[]): KnownSupplier | null {
  const t = texts.filter(Boolean).join(' ');
  return KNOWN_SUPPLIERS.find((s) => s.match.test(t)) ?? null;
}

const STOP = new Set(['the', 'ltd', 'limited', 'plc', 'pharmacy', 'dublin', 'cork', 'limerick', 'galway', 'meath', 'co', 'road', 'street', 'st', 'ta', 't/a', 'and', 'of', 'business', 'park', 'unit', 'industrial', 'estate', 'centre', 'center', 'ireland']);
const tokens = (s: string | null | undefined) =>
  new Set((s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** True when the "supplier" the reader found is really the pharmacy's own ship-to block. */
export function looksLikeOwnPharmacy(name: string | null | undefined, address: string | null | undefined, pharmacy: { name: string; address: string }): boolean {
  if (!name && !address) return false;
  if (/delivered to|deliver to|invoice to|ship to/i.test(`${name} ${address}`)) return true;
  const own = new Set([...tokens(pharmacy.name), ...tokens(pharmacy.address)]);
  const theirs = [...tokens(name), ...tokens(address)];
  const overlap = theirs.filter((w) => own.has(w)).length;
  return overlap >= 1; // generic words are stop-listed, so one distinctive shared word (e.g. "Concourse") is enough
}

const BAD_REF_LABEL = /account|acct|cust|shop|your ?ref|^ref|reference|run|group|rep|order|tote|bin|batch|product|pc ?ref|vat|code/i;
const GOOD_REF_LABEL = /invoice|inv\b|inv\.|number|docket|no\.?:?$/i;

/** Is the reference the invoice/docket number? Returns a flag message if not clearly so. */
export function checkReference(ref: string | null | undefined, label: string | null | undefined): string | null {
  if (!ref) return 'No invoice number read: type it in from the paper';
  const l = (label || '').trim();
  if (l && BAD_REF_LABEL.test(l) && !/invoice/i.test(l)) return `Number read was labelled “${l}”, not the invoice number: check it`;
  if (l && !GOOD_REF_LABEL.test(l)) return `Check the invoice number (read from “${l}”)`;
  return null;
}

/**
 * Pack size from the printed description when the reader didn't give one:
 * "OXYCONTIN 10MG PROLONGED-RELEASE TABS 56" → 56, "OXYNORM 5MG CAPSULES 56 6.52" → 56.
 * Ignores the leading qty, strengths (5MG), long codes (21465), batches and prices.
 */
export function packSizeFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  // Start after the strength (e.g. "10MG", "10mg/5ml"); if none, after the first word of
  // the description. Skips bin, qty, PC ref and product-code columns in front of it.
  const strength = parts.map((p) => /^\d+(\.\d+)?(mg|mcg|micrograms?|g|ml|%)/i.test(p)).lastIndexOf(true);
  const firstWord = parts.findIndex((p) => /^[a-z]{3,}/i.test(p));
  const start = strength >= 0 ? strength + 1 : firstWord >= 0 ? firstWord + 1 : 0;
  for (const p of parts.slice(start)) {
    if (/^\d{1,3}$/.test(p)) {
      const n = Number(p);
      if (n > 0) return n;
    }
  }
  return null;
}
