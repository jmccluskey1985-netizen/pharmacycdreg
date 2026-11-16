'use client';
import { useState } from 'react';
import { UserCheck, UserPlus, AlertTriangle } from 'lucide-react';

export interface PatientCandidateView {
  id: string; first_name: string; surname: string; date_of_birth: string | null; address: string | null; gms_number: string | null; treatment_card_no?: string | null;
  level: 'certain' | 'strong' | 'possible'; reasons: string[]; conflicts: string[];
}
/** What the pharmacist chose: an existing record (optionally updating it from the script) or a new one. */
export type PatientPick = { patient_id: string; update_patient?: string[] } | { new_patient: true } | null;

const fmtDob = (d: string | null) => (d ? d.split('-').reverse().join('/') : null);
const LEVEL: Record<string, string> = { certain: 'Same person', strong: 'Very likely', possible: 'Check' };

/**
 * "Is this one of your patients?" (docs/PATIENT_MATCHING.md §6). Lists near-matches with the
 * reasons they matched; New patient is always offered. Making a new record when there's a
 * very likely match needs a second tap, and is audited on the server.
 */
export function PatientChoice({ candidates, pickId, script, value, onChange, compact }: {
  candidates: PatientCandidateView[]; pickId?: string | null;
  script?: { name?: string | null; address?: string | null; dob?: string | null };
  value: PatientPick; onChange: (v: PatientPick) => void; compact?: boolean;
}) {
  const [confirmNew, setConfirmNew] = useState(false);
  const close = candidates.some((c) => c.level !== 'possible');
  const chosenId = value && 'patient_id' in value ? value.patient_id : null;
  const isNew = !!value && 'new_patient' in value;
  const chosen = candidates.find((c) => c.id === chosenId);
  const addrDiffers = !!(chosen && script?.address && chosen.address && !chosen.reasons.includes('Same address') && !chosen.reasons.includes('Eircode matches') && chosen.address.trim().toLowerCase() !== script.address.trim().toLowerCase());
  const updating = !!(value && 'update_patient' in value && value.update_patient?.includes('address'));

  return (
    <fieldset className={`rounded-xl border border-border ${compact ? 'p-3' : 'p-4'} text-sm`}>
      <legend className="px-1 font-semibold">Is this one of your patients?</legend>
      {script?.name && <p className="mb-2 text-xs text-muted-foreground">On the script: <b className="text-foreground">{script.name}</b>{script.dob ? ` · DOB ${fmtDob(script.dob)}` : ''}{script.address ? ` · ${script.address}` : ''}</p>}
      <div className="space-y-2">
        {candidates.map((c) => (
          <label key={c.id} className={`flex cursor-pointer gap-3 rounded-lg border p-2.5 ${chosenId === c.id ? 'border-primary bg-brand/10' : 'border-border'}`}>
            <input type="radio" name="patient-choice" className="mt-1" checked={chosenId === c.id} onChange={() => { setConfirmNew(false); onChange({ patient_id: c.id }); }} aria-label={`${c.first_name} ${c.surname}`} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <b>{c.first_name} {c.surname}</b>
                <span className={`badge ${c.level === 'possible' ? 'bg-muted text-muted-foreground' : 'bg-brand/15 text-primary'}`}>{LEVEL[c.level]}</span>
                {pickId === c.id && <span className="text-xs text-muted-foreground">(suggested)</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{[c.date_of_birth && `DOB ${fmtDob(c.date_of_birth)}`, c.treatment_card_no && `Card ${c.treatment_card_no}`, c.gms_number && `GMS ${c.gms_number}`, c.address].filter(Boolean).join(' · ') || 'No other details on record'}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                {c.reasons.map((r) => <span key={r} className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] text-primary">✓ {r}</span>)}
                {c.conflicts.map((r) => <span key={r} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-900 dark:text-amber-100">≠ {r}</span>)}
              </span>
            </span>
          </label>
        ))}
        <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 ${isNew ? 'border-primary bg-brand/10' : 'border-border'}`}>
          <input type="radio" name="patient-choice" checked={isNew} onChange={() => { if (close && !confirmNew) { setConfirmNew(true); return; } onChange({ new_patient: true }); }} aria-label="New patient" />
          <UserPlus className="h-4 w-4" /> <b>New patient</b> <span className="text-xs text-muted-foreground">none of these</span>
        </label>
        {confirmNew && !isNew && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" /> A very similar patient is already on file. Make a separate record anyway?
            <button type="button" className="btn-secondary py-1" onClick={() => { setConfirmNew(false); onChange({ new_patient: true }); }}>Yes, new patient</button>
            <button type="button" className="btn-ghost py-1" onClick={() => setConfirmNew(false)}>No</button>
          </div>
        )}
      </div>
      {addrDiffers && chosen && (
        <label className="mt-2 flex items-start gap-2 rounded-lg bg-muted p-2.5 text-xs">
          <input type="checkbox" className="mt-0.5" checked={updating} onChange={(e) => onChange({ patient_id: chosen.id, update_patient: e.target.checked ? ['address'] : [] })} />
          <span><UserCheck className="mr-1 inline h-3.5 w-3.5" />Different address on this script. Update their record to <b>{script?.address}</b>? (Otherwise the record keeps <b>{chosen.address}</b>; the register line always shows what’s on the script.)</span>
        </label>
      )}
    </fieldset>
  );
}

/** Body fields for /api/entries from a pick. */
export const pickFields = (v: PatientPick) => (!v ? {} : 'new_patient' in v ? { new_patient: true, patient_id: null } : { patient_id: v.patient_id, update_patient: v.update_patient?.length ? v.update_patient : undefined });
