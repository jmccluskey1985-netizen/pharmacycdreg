/**
 * Read a photo/PDF of a prescription or wholesaler invoice with Claude and pull out
 * the controlled-drug lines. This produces DRAFTS only — the pharmacist reviews and
 * confirms every line with their PIN before anything touches the register.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const SCAN_MODEL = 'claude-opus-5-5';

const ItemSchema = z.object({
  drug_name: z.string(),
  strength: z.string(),
  form: z.string(),
  quantity: z.number(),
  quantity_unit: z.string(),
  pack_description: z.string(),
  is_controlled_drug: z.boolean(),
  likely_schedule: z.number().int().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  notes: z.string(),
  // Raw fields: what is literally on the page. Rules in lib/quantity.ts decide the
  // register quantity from these (Halo's "the model reads, the rules decide").
  brand: z.string().nullable(),
  packs: z.number().nullable(),
  pack_size: z.number().nullable(),
  quantity_figures: z.string().nullable(),
  quantity_words: z.string().nullable(),
  duration_text: z.string().nullable(),
  is_credit: z.boolean(),
  line_text: z.string().nullable().optional(),
  handwritten_qty: z.string().nullable().optional(),
});

export const ExtractionSchema = z.object({
  document_type: z.enum(['prescription', 'invoice', 'other']),
  document_date: z.string().nullable(),
  reference: z.string().nullable(),
  reference_label: z.string().nullable().optional(),
  supplier_evidence: z.string().nullable().optional(),
  supplier_name: z.string().nullable(),
  supplier_address: z.string().nullable(),
  patient_name: z.string().nullable(),
  patient_address: z.string().nullable(),
  prescriber_name: z.string().nullable(),
  prescriber_address: z.string().nullable(),
  prescriber_registration: z.string().nullable(),
  items: z.array(ItemSchema),
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const nullableString = { type: ['string', 'null'] };
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'document_date', 'reference', 'reference_label', 'supplier_evidence', 'supplier_name', 'supplier_address', 'patient_name', 'patient_address', 'prescriber_name', 'prescriber_address', 'prescriber_registration', 'items', 'warnings'],
  properties: {
    document_type: { type: 'string', enum: ['prescription', 'invoice', 'other'] },
    document_date: { ...nullableString, description: 'Date on the document as YYYY-MM-DD' },
    reference: { ...nullableString, description: 'Invoices: the INVOICE / docket NUMBER only (never the account, customer, shop ref, "Your Ref", reference, run, group, order, tote or product number). Prescriptions: Rx/GMS number.' },
    reference_label: { ...nullableString, description: 'The label printed next to the reference exactly as written, e.g. "INVOICE", "Invoice No:", "NUMBER"' },
    supplier_evidence: { ...nullableString, description: 'Where you read the supplier: logo, letterhead, footer address, "Registered in Ireland" line, or "return to" box — quote it briefly' },
    supplier_name: { ...nullableString, description: 'Wholesaler/supplier (invoices only)' },
    supplier_address: nullableString,
    patient_name: { ...nullableString, description: 'Patient (prescriptions only)' },
    patient_address: nullableString,
    prescriber_name: nullableString,
    prescriber_address: nullableString,
    prescriber_registration: { ...nullableString, description: 'Medical Council / registration number if shown' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['drug_name', 'strength', 'form', 'quantity', 'quantity_unit', 'pack_description', 'is_controlled_drug', 'likely_schedule', 'confidence', 'notes', 'brand', 'packs', 'pack_size', 'quantity_figures', 'quantity_words', 'duration_text', 'is_credit', 'line_text', 'handwritten_qty'],
        properties: {
          drug_name: { type: 'string', description: 'Generic (INN) name, e.g. "Oxycodone hydrochloride". Put any brand in notes.' },
          strength: { type: 'string', description: 'e.g. "10mg", "10mg/5ml"' },
          form: { type: 'string', description: 'e.g. "tablet", "prolonged-release tablet", "oral solution", "ampoule", "patch"' },
          quantity: { type: 'number', description: 'Total amount in base units (tablets, ml, patches). Invoices: packs × pack size. Prescriptions: total to supply.' },
          quantity_unit: { type: 'string', description: 'tablets | capsules | ml | patches | ampoules | units' },
          pack_description: { type: 'string', description: 'As written, e.g. "2 x 28" or "60 (sixty)"' },
          is_controlled_drug: { type: 'boolean', description: 'True if this is a Misuse of Drugs Regulations (Ireland) Schedule 2, 3 or 4 controlled drug' },
          likely_schedule: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          notes: { type: 'string', description: 'Ambiguities, illegible parts, anything the pharmacist must check' },
          brand: { type: ['string', 'null'], description: 'Brand exactly as written (e.g. "OxyNorm"), else null' },
          packs: { type: ['number', 'null'], description: 'Invoices: number of packs on the line (the qty column), else null' },
          pack_size: { type: ['number', 'null'], description: 'Units per pack from the description (e.g. "OXYNORM CAPS 5MG 56" → 56), else null' },
          quantity_figures: { type: ['string', 'null'], description: 'Prescriptions: total quantity in FIGURES exactly as written (e.g. "28"), else null' },
          quantity_words: { type: ['string', 'null'], description: 'Prescriptions: total quantity in WORDS exactly as written (e.g. "twenty-eight"), else null' },
          duration_text: { type: ['string', 'null'], description: 'Duration if written (e.g. "5/7", "28 days"), else null. Never convert it into a quantity.' },
          is_credit: { type: 'boolean', description: 'True for a credit, return or negative line' },
          line_text: { type: ['string', 'null'], description: 'The whole printed line exactly as on the page, all columns left to right (e.g. "2  OXYNORM 5MG CAPSULES  56  6.52")' },
          handwritten_qty: { type: ['string', 'null'], description: 'Any HANDWRITTEN number or mark written by the qty on this line (e.g. a ticked-in "5" or "0"), exactly as seen, else null' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Anything the pharmacist must check: illegible, quantity not in words and figures, missing prescriber details, altered entries.' },
  },
};

const SYSTEM = `You read Irish community-pharmacy documents and extract the controlled-drug lines so a pharmacist can record them in the Controlled Drugs Register. Most documents are wholesaler invoices or delivery dockets (e.g. United Drug, Uniphar, PCO, or a manufacturer direct); some are prescriptions.

Invoices and delivery dockets:
- They list many products; most are not controlled drugs. Return every line you can read but set is_controlled_drug accurately. Lines are often flagged "CD", "C/D", "CD2", "Sch 2" or printed on a separate CD docket — use that as a strong signal, but also recognise CDs by name (e.g. OxyNorm/OxyContin = oxycodone, MST/Zomorph = morphine (but Oramorph 10mg/5ml and other oral morphine ≤ 2mg/ml is Schedule 5 — not a register drug; Oramorph Concentrated 20mg/ml is), Durogesic/Matrifen = fentanyl, Palexia = tapentadol, Targin = oxycodone/naloxone, Ritalin/Concerta = methylphenidate, Elvanse = lisdexamfetamine, methadone, buprenorphine, pethidine, ketamine; benzodiazepines and Z-drugs are Schedule 4).
- Photos are often rotated 90° or 180°. Read them in the correct orientation.
- The quantity column (QTY / Quantity) is the number of PACKS. The register needs base units, so quantity = packs × pack size. Pack size is EITHER in its own column (headed "Packsize" or "PACK") OR at the end of the description (e.g. "OXYCONTIN 10MG PROLONGED-RELEASE TABS 56" → 56). Put the arithmetic in pack_description, e.g. "2 packs x 56". A trailing manufacturer name (e.g. "28 TEVA") is not part of the pack size.
- On dot-matrix invoices the PACK/PRICE columns can sit half a line above or below their description. Match columns by row order, and copy the whole line into line_text. If you can't be sure which pack size belongs to which line, set confidence low and say so.
- Staff often handwrite a tick, a "0" or a different number next to the printed qty (what actually arrived). Put it in handwritten_qty; do NOT use it to change packs.
- The pharmacy itself appears as "Delivered To", "Deliver To", "Invoice To", the ship-to block or a company name in the top-left (e.g. a "Ltd" trading as the pharmacy). That is NEVER the supplier.
- supplier_name/supplier_address are the company that sent the goods: from the logo, letterhead, the footer address line, the "Registered in Ireland" line or the "return to" box. CD dockets and MDA receipts often show the supplier only in the footer or the wording (e.g. "returned signed … to UNIPHAR PLC"). Say where you found it in supplier_evidence. If no address for the supplier is printed, return null for supplier_address.
- reference is the INVOICE or docket NUMBER: the value labelled "INVOICE", "Invoice No", or "NUMBER" on a CD docket. Never use ACCOUNT, Shop Ref, Your Ref, Reference, Run/Ref, Group, Rep Code, Order, Tote, Bin, PC Ref, Batch or Product numbers. Copy its printed label into reference_label.
- document_date is the invoice/docket date (not the print/run time or expiry dates). Convert DD/MM/YY to YYYY-MM-DD (Irish day-first dates).
- An invoice and its CD docket / MDA receipt for the same delivery are separate pages that list the same goods. Read what is on the page you are given.
- If a line is a credit, return or negative quantity, add a warning and set confidence low — it is not a receipt.
- If a page appears to be missing (page numbering, "continued"), add a warning.

Prescriptions:
- Controlled drug prescriptions must state the TOTAL quantity in both words and figures. Copy them exactly into quantity_words and quantity_figures. Put the total in quantity only if it is written; never work a quantity out from a dose and duration (put any duration in duration_text instead).
- Add a warning if words and figures disagree, either is missing, or the script looks altered.

Rules for everything:
- Transcribe only what is on the document. If something is not visible, return null — never guess a name, address or quantity.
- Include every medicine line, but set is_controlled_drug correctly; the register only takes controlled drugs.
- Quantities are what goes in the register: total base units. For invoices multiply packs by pack size (e.g. "2 x 28" tablets = 56). For prescriptions use the total quantity to be supplied, and add a warning if the quantity in words and figures disagree or a figure is missing.
- Mark confidence low for anything partly illegible and say why in notes.
- A human pharmacist verifies every line before it is recorded.`;

export class ScanError extends Error {}

type DocFile = { base64: string; mediaType: string };

const userText = (n: number, hint: string) =>
  `${n > 1 ? `These ${n} images are pages of one document. ` : ''}The pharmacist says this is a ${hint}. Extract the controlled-drug lines.`;

function parseResult(raw: string | null | undefined): Extraction {
  if (!raw) throw new ScanError('No result returned. Try a clearer photo.');
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new ScanError('Could not understand the result. Try a clearer photo.');
  }
  const parsed = ExtractionSchema.safeParse(json);
  if (!parsed.success) throw new ScanError('Could not understand the result. Try a clearer photo.');
  return parsed.data;
}

/**
 * Which reader to use. OpenRouter (same account and privacy settings as Halo) when
 * OPENROUTER_API_KEY is set; otherwise Claude directly via ANTHROPIC_API_KEY.
 */
export async function extractFromDocument(files: DocFile[], hint: 'invoice' | 'prescription' = 'invoice'): Promise<{ extraction: Extraction; model: string }> {
  if (process.env.OPENROUTER_API_KEY) return extractViaOpenRouter(files, hint);
  if (process.env.ANTHROPIC_API_KEY) return extractViaAnthropic(files, hint);
  throw new ScanError('Document reading is not configured (set OPENROUTER_API_KEY or ANTHROPIC_API_KEY)');
}

/**
 * OpenRouter, mirroring Halo: the first model in OPENROUTER_MODELS is used, the
 * rest are automatic fallbacks. Zero data retention is REQUIRED on every call
 * (provider.zdr + data_collection deny), so only endpoints that store nothing are
 * used. Structured JSON output is required of the provider.
 */
async function extractViaOpenRouter(files: DocFile[], hint: string): Promise<{ extraction: Extraction; model: string }> {
  const models = (process.env.OPENROUTER_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  if (!models.length) throw new ScanError('Document reading is not configured (OPENROUTER_MODELS missing)');

  const parts = files.map((f) =>
    f.mediaType === 'application/pdf'
      ? { type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${f.base64}` } }
      : { type: 'image_url', image_url: { url: `data:${f.mediaType};base64,${f.base64}` } },
  );

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'PharmacyCDReg',
      },
      body: JSON.stringify({
        model: models[0],
        ...(models.length > 1 ? { models } : {}),
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [...parts, { type: 'text', text: userText(files.length, hint) }] },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'cd_extraction', strict: true, schema: JSON_SCHEMA } },
        provider: { zdr: true, data_collection: 'deny', require_parameters: true },
        temperature: 0,
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(100_000),
    });
  } catch {
    throw new ScanError('Could not reach the document reader. Check the connection and try again.');
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg: string = data?.error?.message || `HTTP ${res.status}`;
    console.error('[scan] openrouter error', res.status, msg);
    // Same distinctions Halo learned the hard way: a full provider vs an account that can't pay.
    if (res.status === 402) throw new ScanError('The document reader account is out of credit. Top up OpenRouter, or enter the entry manually.');
    if (res.status === 429) throw new ScanError('The document reader is busy. Wait a moment and try again.');
    throw new ScanError('The document could not be read. Please enter the entry manually.');
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new ScanError('The document was too long to read in one go. Try one page at a time.');
  return { extraction: parseResult(choice?.message?.content), model: `openrouter:${data.model ?? models[0]}` };
}

async function extractViaAnthropic(files: DocFile[], hint: string): Promise<{ extraction: Extraction; model: string }> {
  const client = new Anthropic();

  // Several photos = several pages of ONE document (e.g. a two-page delivery docket).
  const media = files.map((file) =>
    file.mediaType === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.base64 } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: file.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: file.base64 } } as const),
  );

  const response = await client.beta.messages.create({
    model: SCAN_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // if a safety classifier declines, the API retries on a recommended model
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: JSON_SCHEMA } },
    messages: [{ role: 'user', content: [...media, { type: 'text', text: userText(media.length, hint) }] }],
  });

  if (response.stop_reason === 'refusal') throw new ScanError('The document could not be read. Please enter the entry manually.');
  if (response.stop_reason === 'max_tokens') throw new ScanError('The document was too long to read in one go. Try one page at a time.');
  const text = response.content.find((b) => b.type === 'text');
  return { extraction: parseResult(text && text.type === 'text' ? text.text : null), model: response.model };
}
