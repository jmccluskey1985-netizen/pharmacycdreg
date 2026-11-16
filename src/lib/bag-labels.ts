import { z } from 'zod';

/**
 * Dispensing bag labels (printed by the dispensing system) → the pharmacy's opioid substitution
 * patients. Labels carry accurate, repeatable details (name, address, product, dose), which makes
 * them a better source for the OST patient list than handwritten forms.
 */
const strN = z.preprocess((v) => (v === '' ? null : v), z.string().nullable()).catch(null);
const numN = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().nullable()).catch(null);

export const BagLabelsSchema = z.object({
  labels: z.array(z.object({
    patient_name: strN, patient_address: strN, pmr_code: strN,
    drug_name: strN, brand: strN, strength: strN, form: strN,
    daily_dose: numN, dose_text: strN, treatment_card_no: strN, label_date: strN,
  })).catch([]),
  warnings: z.array(z.string()).catch([]),
});
export type BagLabels = z.infer<typeof BagLabelsSchema>;

const s = { type: ['string', 'null'] };
export const BAG_LABELS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['labels', 'warnings'],
  properties: {
    labels: {
      type: 'array',
      description: 'One item per patient label visible in the photo(s): bag labels (date, name, address) or medicine labels. The pharmacist has chosen these as opioid substitution patients.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['patient_name', 'patient_address', 'pmr_code', 'drug_name', 'brand', 'strength', 'form', 'daily_dose', 'dose_text', 'treatment_card_no', 'label_date'],
        properties: {
          patient_name: { ...s, description: 'Patient name as printed, WITHOUT any code in brackets' },
          pmr_code: { ...s, description: 'The short patient code printed in brackets after the name, e.g. "W75" from "Michelle WALSH (W75)", else null' },
          patient_address: { ...s, description: 'Patient address if printed, else null' },
          drug_name: { ...s, description: 'Generic name if a medicine is printed (bag labels often have none), e.g. "Methadone hydrochloride", else null' },
          brand: { ...s, description: 'Brand or product as printed (e.g. "Methadone DTF", "Physeptone", "Pinadone"), else null' },
          strength: { ...s, description: 'e.g. "1mg/ml", "8mg"' },
          form: { ...s, description: 'e.g. "oral solution", "sublingual tablet"' },
          daily_dose: { type: ['number', 'null'], description: 'Dose per day as a number (ml for 1mg/ml solution), if printed' },
          dose_text: { ...s, description: 'The directions as printed, e.g. "Take 75ml daily"' },
          treatment_card_no: { ...s, description: 'Treatment card / PH number if printed, else null' },
          label_date: { ...s, description: 'Date on the label as YYYY-MM-DD, else null' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

export const BAG_LABELS_SYSTEM = `You read pharmacy labels (printed bag labels and medicine labels) in an Irish community pharmacy, to build the list of opioid substitution (methadone / buprenorphine) patients. Bag labels usually show a date, the patient's name (often with a short dispensing-system code in brackets, e.g. "(W75)"), the address and a charge line ("Non Chargeable", "Amount Due"); they don't name the medicine. Transcribe exactly what is printed: never guess a name, address, code or dose. Ignore the pharmacy's own name and address and the charge line. Return JSON only.`;
export const bagLabelsPrompt = (n: number) => `${n} photo(s) of patient labels. List every patient label you can read, one item each.`;
