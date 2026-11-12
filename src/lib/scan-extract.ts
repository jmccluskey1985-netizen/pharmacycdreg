/**
 * Read a photo/PDF of a prescription or wholesaler invoice with Claude and pull out
 * the controlled-drug lines. This produces DRAFTS only — the pharmacist reviews and
 * confirms every line with their PIN before anything touches the register.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const SCAN_MODEL = 'claude-opus-5-5';

// Tolerant of how different models answer (missing keys, numbers as text), but every
// value still has the right type before the quantity rules see it.
const str = z.preprocess((v) => (v == null ? '' : String(v)), z.string());
const strN = z.preprocess((v) => (v == null || v === '' ? null : String(v)), z.string().nullable());
const num = z.preprocess((v) => (typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v ?? 0), z.number().catch(0));
const numN = z.preprocess((v) => (v == null || v === '' ? null : typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v), z.number().nullable().catch(null));
const bool = (d: boolean) => z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : v ?? d), z.boolean().catch(d));

const ItemSchema = z.object({
  drug_name: str,
  strength: str,
  form: str,
  quantity: num,
  quantity_unit: str,
  pack_description: str,
  is_controlled_drug: bool(false),
  likely_schedule: numN,
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
  notes: str,
  // Raw fields: what is literally on the page. Rules in lib/quantity.ts decide the
  // register quantity from these (Halo's "the model reads, the rules decide").
  brand: strN,
  packs: numN,
  pack_size: numN,
  quantity_figures: strN,
  quantity_words: strN,
  duration_text: strN,
  is_credit: bool(false),
  line_text: strN.optional(),
  units_per_dose: numN.optional(),
  handwritten_qty: strN.optional(),
});

export const ExtractionSchema = z.object({
  document_type: z.enum(['prescription', 'invoice', 'other']).catch('other'),
  document_date: strN,
  reference: strN,
  reference_label: strN.optional(),
  supplier_evidence: strN.optional(),
  supplier_name: strN,
  supplier_address: strN,
  patient_name: strN,
  patient_address: strN,
  patient_dob: strN.optional(),
  prescriber_name: strN,
  prescriber_address: strN,
  prescriber_registration: strN,
  items: z.array(ItemSchema).catch([]),
  warnings: z.array(z.string()).catch([]),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const nullableString = { type: ['string', 'null'] };
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'document_date', 'reference', 'reference_label', 'supplier_evidence', 'supplier_name', 'supplier_address', 'patient_name', 'patient_address', 'patient_dob', 'prescriber_name', 'prescriber_address', 'prescriber_registration', 'items', 'warnings'],
  properties: {
    document_type: { type: 'string', enum: ['prescription', 'invoice', 'other'] },
    document_date: { ...nullableString, description: 'Date on the document as YYYY-MM-DD' },
    reference: { ...nullableString, description: 'Invoices: the INVOICE / docket NUMBER only (never the account, customer, shop ref, "Your Ref", reference, run, group, order, tote or product number). Prescriptions: the Rx / order / GMS number (e.g. hospital "Order ID"), used to stop the same prescription being entered twice.' },
    reference_label: { ...nullableString, description: 'The label printed next to the reference exactly as written, e.g. "INVOICE", "Invoice No:", "NUMBER"' },
    supplier_evidence: { ...nullableString, description: 'Where you read the supplier: logo, letterhead, footer address, "Registered in Ireland" line, or "return to" box — quote it briefly' },
    supplier_name: { ...nullableString, description: 'Wholesaler/supplier (invoices only)' },
    supplier_address: nullableString,
    patient_name: { ...nullableString, description: 'Patient (prescriptions only)' },
    patient_address: nullableString,
    patient_dob: { ...nullableString, description: 'Patient date of birth as YYYY-MM-DD (prescriptions), else null' },
    prescriber_name: nullableString,
    prescriber_address: nullableString,
    prescriber_registration: { ...nullableString, description: 'Medical Council / registration number if shown' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['drug_name', 'strength', 'form', 'quantity', 'quantity_unit', 'pack_description', 'is_controlled_drug', 'likely_schedule', 'confidence', 'notes', 'brand', 'packs', 'pack_size', 'quantity_figures', 'quantity_words', 'duration_text', 'is_credit', 'line_text', 'handwritten_qty', 'units_per_dose'],
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
          units_per_dose: { type: ['number', 'null'], description: 'Prescriptions where the total is in DOSES: tablets/capsules/ml per dose (e.g. "5mg" dose of a 5mg capsule = 1; 10mg dose of 5mg = 2), else null' },
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
- Hospital and discharge prescriptions often state the total as a number of DOSES (e.g. "total to dispense eighteen doses"). Copy it as written (quantity_words "eighteen doses"), set quantity_unit to "doses", and set units_per_dose from the dose and the product strength (5 mg dose of 5 mg capsules = 1). Use the handwritten CD section as the legal wording when present.
- The prescriber is the person who signed (name and registration number near the signature), not the consultant in the header, unless they are the same.
- Add a warning if words and figures disagree, either is missing, or the script looks altered.

Rules for everything:
- Transcribe only what is on the document. If something is not visible, return null — never guess a name, address or quantity.
- Include every medicine line, but set is_controlled_drug correctly; the register only takes controlled drugs.
- Quantities are what goes in the register: total base units. For invoices multiply packs by pack size (e.g. "2 x 28" tablets = 56). For prescriptions use the total quantity to be supplied, and add a warning if the quantity in words and figures disagree or a figure is missing.
- Mark confidence low for anything partly illegible and say why in notes.
- A human pharmacist verifies every line before it is recorded.`;

export class ScanError extends Error {}

export type DocFile = { base64: string; mediaType: string };

const userText = (n: number, hint: string) =>
  `${n > 1 ? `These ${n} images are pages of one document. ` : ''}The pharmacist says this is a ${hint}. Extract the controlled-drug lines.`;

export interface ReadConfig<T> { system: string; schema: object; name: string; prompt: string; parse: (raw: string | null | undefined) => T; reader?: { apiKey: string; models: string[] } | null }

export function parseJsonWith<S extends z.ZodTypeAny>(schema: S) {
  return (raw: string | null | undefined): z.output<S> => {
    if (!raw) throw new ScanError('No result returned. Try a clearer photo.');
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let json: unknown;
    try { json = JSON.parse(cleaned); }
    catch {
      const i = cleaned.indexOf('{'), j = cleaned.lastIndexOf('}');
      try { json = JSON.parse(cleaned.slice(i, j + 1)); } catch { throw new ScanError('Could not understand the result. Try a clearer photo.'); }
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ScanError('Could not understand the result. Try a clearer photo.');
    return parsed.data;
  };
}

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
export async function extractFromDocument(files: DocFile[], hint: 'invoice' | 'prescription' = 'invoice', reader?: { apiKey: string; models: string[] } | null): Promise<{ extraction: Extraction; model: string }> {
  const { result, model } = await readDocument(files, { system: SYSTEM, schema: JSON_SCHEMA, name: 'cd_extraction', prompt: userText(files.length, hint), parse: parseResult, reader });
  return { extraction: result, model };
}

/** Read a document with any prompt + JSON schema, using the configured reader. */
export async function readDocument<T>(files: DocFile[], cfg: ReadConfig<T>): Promise<{ result: T; model: string }> {
  if (cfg.reader?.apiKey || process.env.OPENROUTER_API_KEY) return extractViaOpenRouter(files, cfg);
  if (process.env.ANTHROPIC_API_KEY) return extractViaAnthropic(files, cfg);
  throw new ScanError('Reading documents isn’t available right now. Please enter it by hand.');
}

/**
 * OpenRouter, mirroring Halo: the first model in OPENROUTER_MODELS is used, the
 * rest are automatic fallbacks. Zero data retention is REQUIRED on every call
 * (provider.zdr + data_collection deny), so only endpoints that store nothing are
 * used. Structured JSON output is required of the provider.
 */
async function extractViaOpenRouter<T>(files: DocFile[], cfg: ReadConfig<T>): Promise<{ result: T; model: string }> {
  const models = cfg.reader?.models?.length ? cfg.reader.models : (process.env.OPENROUTER_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  const apiKey = cfg.reader?.apiKey || process.env.OPENROUTER_API_KEY;
  if (!models.length) throw new ScanError('Reading documents isn’t available right now. Please enter it by hand.');

  const parts = files.map((f) =>
    f.mediaType === 'application/pdf'
      ? { type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${f.base64}` } }
      : { type: 'image_url', image_url: { url: `data:${f.mediaType};base64,${f.base64}` } },
  );

  const userContent = [...parts, { type: 'text', text: cfg.prompt }];
  const strict = { response_format: { type: 'json_schema', json_schema: { name: cfg.name, strict: true, schema: cfg.schema } }, system: cfg.system };
  // Some models (e.g. Gemini) refuse parts of a strict schema. Fall back to plain JSON mode
  // with the schema in the instructions; the reply is still validated before use.
  const loose = { response_format: { type: 'json_object' }, system: `${cfg.system}\n\nReply with ONLY one JSON object (no prose, no code fences) that matches this JSON Schema exactly, using null where something isn't on the document:\n${JSON.stringify(cfg.schema)}` };

  let last: OpenRouterFailure | null = null;
  let chain = [...models];
  for (const mode of [strict, loose]) {
    let r = await callOpenRouter(apiKey!, chain, mode.system, userContent, mode.response_format);
    // A model with no zero-data provider: drop it and go on with the back-ups (never relax zero-data).
    while (!r.ok && /no endpoints|data policy|zero data retention/i.test(r.message) && chain.length > 1) {
      chain = chain.slice(1);
      r = await callOpenRouter(apiKey!, chain, mode.system, userContent, mode.response_format);
    }
    if (r.ok) {
      const choice = r.data.choices?.[0];
      if (choice?.finish_reason === 'length') throw new ScanError('The document was too long to read in one go. Try one page at a time.');
      return { result: cfg.parse(choice?.message?.content), model: `openrouter:${r.data.model ?? chain[0]}${mode === loose ? ' (json mode)' : ''}` };
    }
    last = r;
    if (r.status === 402) throw new ScanError('The document reader account is out of credit. Top up OpenRouter, or enter the entry manually.');
    if (r.status === 429) throw new ScanError('The document reader is busy. Wait a moment and try again.');
    if (r.status === 401 || r.status === 403) throw new ScanError('OpenRouter didn’t accept the key. The site owner can check it in Settings → Document reading.');
    if (!r.retryable) break;
  }
  throw new ScanError(explainOpenRouter(last!, models));
}

interface OpenRouterFailure { ok: false; status: number; message: string; retryable: boolean }
type OpenRouterResult = { ok: true; data: any } | OpenRouterFailure;

async function callOpenRouter(apiKey: string, models: string[], system: string, userContent: unknown[], responseFormat: object): Promise<OpenRouterResult> {
  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'PharmacyCDReg' },
      body: JSON.stringify({
        model: models[0],
        ...(models.length > 1 ? { models } : {}),
        messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
        response_format: responseFormat,
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
  if (res.ok && !data.error) return { ok: true, data };
  const status = res.ok ? Number(data?.error?.code) || 500 : res.status;
  const raw = data?.error?.metadata?.raw;
  const message = [data?.error?.message, typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''].filter(Boolean).join(' — ').slice(0, 400) || `HTTP ${res.status}`;
  console.error('[scan] openrouter error', status, message);
  // Schema/format problems and "no endpoint supports these parameters" are worth one retry in JSON mode.
  const retryable = [400, 404, 422, 500, 502].includes(status) || /schema|response_format|structured|json|parameter|endpoint/i.test(message);
  return { ok: false, status, message, retryable };
}

/** Plain-English reason, including what OpenRouter said, so it can be fixed in Settings. */
function explainOpenRouter(f: OpenRouterFailure, models: string[]): string {
  const said = f.message ? ` (OpenRouter: “${f.message.slice(0, 220)}”)` : '';
  if (/no endpoints|data policy|zero data retention|zdr|data_collection/i.test(f.message)) {
    return `The chosen model (${models[0]}) has no provider on OpenRouter that keeps zero data. Pick another model in Settings → Document reading, or add a back-up model.${said}`;
  }
  if (/model.*(not|n't) (found|exist|valid)|invalid model|not a valid model/i.test(f.message)) return `OpenRouter doesn’t recognise the model “${models[0]}”. Choose it again from the list in Settings → Document reading.${said}`;
  if (/image|vision|modalit/i.test(f.message)) return `The chosen model can’t read photos. Pick a model from the list in Settings → Document reading (it only shows ones that can).${said}`;
  return `The document could not be read. Please enter it by hand.${said}`;
}

async function extractViaAnthropic<T>(files: DocFile[], cfg: ReadConfig<T>): Promise<{ result: T; model: string }> {
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
    system: cfg.system,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // if a safety classifier declines, the API retries on a recommended model
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: cfg.schema as any } },
    messages: [{ role: 'user', content: [...media, { type: 'text', text: cfg.prompt }] }],
  });

  if (response.stop_reason === 'refusal') throw new ScanError('The document could not be read. Please enter the entry manually.');
  if (response.stop_reason === 'max_tokens') throw new ScanError('The document was too long to read in one go. Try one page at a time.');
  const text = response.content.find((b) => b.type === 'text');
  return { result: cfg.parse(text && text.type === 'text' ? text.text : null), model: response.model };
}
