import { z } from 'zod';

const s = (min = 1) => z.string().trim().min(min);
const opt = z.string().trim().optional().nullable();
const qty = z.coerce.number().positive().max(1_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const base = {
  register_id: z.string().uuid(),
  transaction_date: date,
  notes: opt,
  scan_id: z.string().uuid().optional().nullable(),
  inbox_id: z.string().uuid().optional().nullable(),
  // Pharmacist confirms a flagged possible duplicate is a genuine separate entry.
  allow_duplicate: z.boolean().optional(),
  duplicate_reason: z.string().trim().max(300).optional().nullable(),
  // Entry made more than a day after the transaction: why (kept in the line's notes).
  late_reason: z.string().trim().max(300).optional().nullable(),
};

const card = z.string().trim().max(30).optional().nullable();
// Which patient record a supply / return belongs to (docs/PATIENT_MATCHING.md §7). None of these
// are register columns: the route takes them off before the line is written.
const patientChoice = {
  new_patient: z.boolean().optional(),          // pharmacist chose "New patient"
  interactive: z.boolean().optional(),          // a person is at the screen and can be asked to pick
  update_patient: z.array(z.enum(['address', 'date_of_birth', 'gms_number', 'eircode'])).max(4).optional(), // overwrite these on the record from this script
  patient_details: z.object({ first_name: z.string().trim().max(80).optional().nullable(), surname: z.string().trim().max(80).optional().nullable(), eircode: card, gms: card, dps: card, lti: card, mrn: card }).partial().optional().nullable(),
};

// Mandatory statutory fields per entry type (FR5, FR19). The database enforces the
// same minimums with CHECK constraints, so a bypassed UI still can't write a gap.
export const EntrySchema = z.discriminatedUnion('entry_type', [
  z.object({ ...base, entry_type: z.literal('receipt'), quantity: qty, supplier_name: s(2), supplier_address: s(3) }),
  z.object({
    ...base,
    entry_type: z.literal('supply'),
    quantity: qty,
    recipient_name: s(2),
    recipient_address: s(3),
    prescriber_name: opt,
    prescriber_address: opt,
    authority_to_possess: opt,
    prescription_ref: opt,
    collected_by: opt,
    collector_id_checked: z.boolean().optional().nullable(),
    patient_id: z.string().uuid().optional().nullable(),
    requisition: z.boolean().optional(), // supplied to a practitioner / business on a signed requisition
    patient_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().catch(null), // for a new patient record only
    ...patientChoice,
  }),
  z.object({ ...base, entry_type: z.literal('destruction'), quantity: qty, witness_name: s(2), witness_role: s(2), destruction_method: opt }),
  z.object({ ...base, entry_type: z.literal('patient_return'), quantity: qty, recipient_name: s(2), recipient_address: opt, patient_id: z.string().uuid().optional().nullable(), patient_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().catch(null), ...patientChoice }),
  z.object({ ...base, entry_type: z.literal('patient_return_destruction'), quantity: qty, witness_name: s(2), witness_role: s(2), destruction_method: opt, recipient_name: opt }),
  // Stock adjustment after a stock check (made through /api/stock-checks/[id]/adjust).
  z.object({ ...base, entry_type: z.literal('adjustment_in'), quantity: qty, notes: s(10) }),
  z.object({ ...base, entry_type: z.literal('adjustment_out'), quantity: qty, notes: s(10) }),
  z.object({
    ...base,
    entry_type: z.literal('correction'),
    corrects_entry_id: z.string().uuid(),
    correction_reason: s(5),
    quantity: z.coerce.number().min(0),
    supplier_name: opt,
    supplier_address: opt,
    recipient_name: opt,
    recipient_address: opt,
    prescriber_name: opt,
    prescriber_address: opt,
    authority_to_possess: opt,
    prescription_ref: opt,
    witness_name: opt,
    witness_role: opt,
  }),
]);

export type EntryInput = z.infer<typeof EntrySchema>;

export const STOCK_EFFECT: Record<string, 1 | -1 | 0> = {
  receipt: 1,
  supply: -1,
  destruction: -1,
  adjustment_in: 1,
  adjustment_out: -1,
  patient_return: 0,
  patient_return_destruction: 0,
};
