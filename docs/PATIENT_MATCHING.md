# Patient matching: pick an existing patient instead of making duplicates

**Goal:** when a prescription is scanned (or a supply is typed, or comes in from Halo), the pharmacist is shown the existing patients who look like the person on the script and picks one with a single tap. A new patient record is created only when nobody close exists, or when the pharmacist says this really is someone new.

This is the same idea Halo uses when it decides whether two pages, or a page and a TouchStore record, are the same person. The rules below follow Halo's (Halo 1.4.45, "Pages of one patient go in together") and adapt them to CDReg's `patients` table.

> The repo is public. Use made-up names in tests and examples, and never log patient names, addresses, DOBs or card numbers.

---

## 1. What happens today, and why it makes duplicates

- `src/lib/scan-extract.ts` reads `patient_name`, `patient_address` and `patient_dob` from the script.
- The scan card fills the supply form. If the pharmacist doesn't pick a patient from the **Supplied to** quick-fill, the form posts with no `patient_id`.
- `/api/entries` then calls `findOrCreatePatient` (`src/lib/patients.ts`). It looks for an **exact** case-insensitive match on first name + surname (+ address when there is one), and otherwise **silently creates a new patient**.

So each of these makes a second record for the same person:

| On the script | Already on file | Why it misses |
|---|---|---|
| `O'BRIEN, MARY` | Mary OBrien | apostrophe |
| `Mary Anne O Brien` | Mary O'Brien | middle name and space in surname |
| `Sean Murphy` | Seán Murphy | accent |
| `Mary Kelly, 14 Main St, Ennis, V95 X2Y3` | Mary Kelly, 14 Main Street, Ennis | address written differently |
| `Mary Kelly` with no address | Mary Kelly, 14 Main St | address missing from the script, so the name-only check finds the record, **but** two Mary Kellys can't be told apart |
| `WILSON PETER` (surname first, no comma) | Peter Wilson | name order |
| `Kate Byrne` | Katherine Byrne | short form of the first name |
| `Mary Kely` (misread) | Mary Kelly | reader error, one letter |

`splitName` also just takes the last word as the surname, so `MC GUINNESS` and `O CONNOR` split wrongly.

---

## 2. What we want

1. **Read more identifiers from the script**, the way Halo does (section 3).
2. **Score every plausible existing patient** with one pure function, `matchPatients()` (section 5).
3. **Show the candidates on the scan card and in the supply form** with the reasons ("DOB matches", "GMS number matches", "Surname one letter different"). The pharmacist taps one, or taps **New patient** (section 6).
4. **Never create a patient silently** when there is a reasonable candidate. Auto-link only when the match is certain (section 7).
5. **Fill gaps in the chosen record** from the scan (DOB, GMS number, address), but ask before changing something that is already there (section 8).
6. **Let pharmacists merge the duplicates that already exist** (section 9).

---

## 3. Reader: extra fields to extract

Add these to the prescription schema in `src/lib/scan-extract.ts`, using the wording in `RX_READER_SPEC.md` (patient name rules, addressograph stickers, scheme cards):

| Field | Notes |
|---|---|
| `patient_first_name`, `patient_surname` | Split by the reader. Irish hospital pads print SURNAME first. Keep multi-word surnames together (`MC GUINNESS`, `O CONNOR`, `NI BHRIAIN`). Keep `patient_name` too. |
| `patient_dob` | Already read. Only from the DOB box or sticker, never from a stamp or signature date. |
| `patient_address` | Already read. Home address only. |
| `patient_eircode` | 7 characters, e.g. `V95 X2Y3`. Also pull it out of the address in code if the reader misses it. |
| `gms_number`, `dps_number`, `lti_number` | From the script or a scheme card in the photo. Keep the household letter on GMS numbers. |
| `hospital_mrn` | MRN from a hospital sticker. |
| `ppsn` | **Used for matching only; don't store it** unless we decide we need to (section 4). |

Every new field is nullable. A missing value is `null`, never a guess.

---

## 4. Database (migration `0016_patient_matching.sql`)

```sql
alter table patients add column if not exists dps_number text;
alter table patients add column if not exists lti_number text;
alter table patients add column if not exists hospital_mrn text;
alter table patients add column if not exists eircode text;          -- normalised, no space, upper case
alter table patients add column if not exists name_key text;          -- normalised surname, see 5.1
alter table patients add column if not exists merged_into uuid references patients(id);

create index if not exists patients_dob     on patients (pharmacy_id, date_of_birth) where is_active;
create index if not exists patients_eircode on patients (pharmacy_id, eircode)       where is_active and eircode is not null;
create index if not exists patients_namekey on patients (pharmacy_id, name_key)      where is_active;
create index if not exists patients_dps     on patients (pharmacy_id, dps_number)    where dps_number is not null;
create index if not exists patients_lti     on patients (pharmacy_id, lti_number)    where lti_number is not null;
create index if not exists patients_mrn     on patients (pharmacy_id, hospital_mrn)  where hospital_mrn is not null;
```

- Backfill `name_key` and `eircode` for existing rows in the same migration, or with a one-off script that runs the same TypeScript normaliser, so there's only one source of truth.
- `gms_number` and its index already exist (migration 0008).
- **PPSN:** don't add a column for now. If we add one later, keep it encrypted the way `secret-box.ts` does, and match on a hash.
- Every write to `patients` keeps `name_key` and `eircode` up to date (POST, PATCH, import, find-or-create).

---

## 5. Matching logic: `src/lib/patient-match.ts`

A **pure** module with no database calls, so it's easy to unit test. The API route fetches the candidates and passes them in.

```ts
export interface PatientProbe {
  first_name: string | null; surname: string | null; full_name?: string | null;
  dob: string | null;            // YYYY-MM-DD
  address: string | null; eircode?: string | null;
  gms?: string | null; dps?: string | null; lti?: string | null; mrn?: string | null;
}
export type MatchLevel = 'certain' | 'strong' | 'possible';
export interface PatientCandidate { patient: Patient; level: MatchLevel; score: number; reasons: string[]; conflicts: string[] }

export function matchPatients(probe: PatientProbe, pool: Patient[]): PatientCandidate[];
```

### 5.1 Normalising (`normName`, `normAddress`, `normEircode`, `normCard`)

**Names**
- Lower case, strip accents (`Seán` → `sean`), drop apostrophes, full stops and hyphens. `O'Brien`, `O Brien`, `OBrien` → `obrien`. `Mc Guinness`, `McGuinness` → `mcguinness`. `Mac` stays `mac`: don't merge `mac` and `mc`.
- `name_key` is the normalised surname.
- Name order: if `first_name`/`surname` aren't given, accept `SURNAME, FORENAME` (comma) and also try both orders of a two-word name. **Scoring uses whichever order matches better.**
- First names: compare the **first given name**, and treat a middle name as optional (`Mary Anne` ~ `Mary`).
- Short forms: a small, fixed list (Kate/Katie/Katherine/Catherine, Liz/Elizabeth, Jim/James, Seamus/James, Sean/John, Pat/Patrick/Patricia, Tom/Thomas, Bill/William, Peggy/Margaret, Maggie/Margaret, Mick/Michael, Tadhg/Timothy …). A short-form match **only ever counts as "possible"** unless the DOB or a card number also agrees.
- First initial only (e.g. `M. Kelly`) counts the same as a short form.

**Addresses**
- Lower case, drop punctuation, collapse spaces, expand `st`→`street`, `rd`→`road`, `ave`→`avenue`, `co`→`county`, `apt`→`apartment`.
- Pull out the **eircode** (`[A-Z]\d[\dW] ?[A-Z\d]{4}`), upper case, no space.
- Pull out the **house number** (the first number). Then compare the remaining word sets (Jaccard ≥ 0.6 counts as "same address").

**Dates of birth:** compare `YYYY-MM-DD`. Also note when day and month are **swapped** (03/04 vs 04/03). That counts as "possible", never as a match.

**Card numbers / MRN:** upper case, remove spaces. GMS: compare with the household letter, and as a fallback without it, which makes it "family member, not the same person" (see conflicts).

### 5.2 Getting candidates out of the database

Inside `POST /api/patients/match`, run one query for this pharmacy's active patients, then score them in TypeScript:

```
pharmacy_id = $1 and is_active and merged_into is null and (
     name_key = $surnameKey
  or name_key like $first3 || '%'   -- catches one-letter misreads at the end of the name
  or date_of_birth = $dob
  or eircode = $eircode
  or gms_number = $gms or dps_number = $dps or lti_number = $lti or hospital_mrn = $mrn
) limit 200
```

Add whichever clauses have values. Also check the **swapped** order (the first name's key as the surname). Pharmacy patient lists are small, so this is cheap.

### 5.3 Scoring

Work out each signal, then the level. This follows Halo's rule: **name AND (DOB or a number)**.

| Signal | Meaning |
|---|---|
| `nameExact` | Surname key equal, first given name equal |
| `nameClose` | Surname one edit away (Damerau-Levenshtein ≤ 1; ≤ 2 for surnames of 8+ letters), first given name equal **or** a short form / initial |
| `dob` | DOB equal |
| `dobSwapped` | Day and month swapped |
| `number` | Any of GMS (with letter) / DPS / LTI / MRN equal |
| `eircode` | Eircode equal |
| `address` | Same house number and words overlap (5.1) |

**Conflicts.** Any one of these stops the candidate being `certain` or `strong`. It's still listed if the name matches, so the pharmacist can see why it isn't preselected:

- both sides have a DOB and they differ, and **no number is in common**
- both sides have a number for the **same scheme** and they differ
- the GMS number is the same without the household letter but the letter differs: family member, **not** the same person
- both sides have an eircode and they differ, and there's no DOB or number to settle it (people move house: warn, don't block)

**Levels**

| Level | Rule | What the UI does |
|---|---|---|
| `certain` | `nameExact` and (`dob` or `number`), no conflicts | Preselected, ✓ shown. Safe to auto-link when nobody is there to ask (Halo inbox, import). |
| `strong` | `nameExact` and (`eircode` or `address`), no conflicts, nothing to compare DOB/number against; **or** `nameClose` and `dob` **and** `number` (Halo's "one letter out counts only if DOB AND a number agree") | Preselected, but the pharmacist confirms it on the card. |
| `possible` | `nameExact` with nothing else (no DOB, no address on one side); `nameClose` with `dob` or `number` or `eircode`; `dobSwapped`; same DOB + same eircode with a different first name (twins, or a reader mistake); any candidate with conflicts but the same name | Listed, not preselected. |
| *(dropped)* | Anything else | Not shown. |

`score` only orders candidates within a level (number 40, DOB 30, eircode 20, address 15, nameExact 20, nameClose 10, minus 25 per conflict). Show **at most 5**, `certain` first.

If **two or more** candidates are `certain` or `strong`, preselect **none** and show the message "More than one patient matches; pick the right one". That's an existing duplicate, so offer **Merge** (section 9).

`reasons` / `conflicts` are short plain phrases the card shows as chips: `DOB matches`, `GMS matches`, `Eircode matches`, `Same address`, `Surname one letter different`, `First name: Kate / Katherine`, `Different DOB`, `Different GMS number`, `Day and month of DOB swapped`.

---

## 6. UI

### 6.1 Scan card (`/dashboard/scan`, and the "From a dispensing" scan in `new-entry.tsx`)

Right after a prescription is read, call `POST /api/patients/match` with the read fields, and show a **Patient** box above the supply form:

```
Patient on the script:  MARY KELLY · 12/03/1950 · 14 Main St, Ennis V95 X2Y3 · GMS 1234567A

  (•) Mary Kelly        12/03/1950  14 Main Street, Ennis     [DOB matches] [GMS matches]     ← preselected (certain)
  ( ) Mary Kelly        —           Church Rd, Kilrush        [Name only]                      ← possible
  ( ) + New patient (use the details from the script)
```

- One tap picks. Picking fills `patient_id`, the name and address **as they're on the patient record**, and the usual prescriber, exactly as the quick-fill `pickPatient` does today (`entry-form.tsx`).
- If the address on the script differs from the record, show both and let the pharmacist choose which goes on **this register line**. The register line is the statutory record; it should show the address as supplied.
- **New patient** creates the record when the entry is saved, not before (so a cancelled scan leaves nothing behind).
- If the pharmacist picks **New patient** while there's a `certain` or `strong` candidate, ask once: "Mary Kelly (12/03/1950) is already on file. Create a second record anyway?" Record the answer in the audit (`patient.created_despite_match`).
- No candidates at all → just "New patient: Mary Kelly", ticked.

### 6.2 Typed supplies (`entry-form.tsx`, **Supplied to**)

The quick-fill already searches patients. Two changes:

- When the pharmacist types a name and moves on **without picking**, run the same match. If there are candidates, show "Did you mean …?" under the field with the same list, before Save.
- Search uses the normaliser, so `obrien` finds O'Brien and `sean` finds Seán.

### 6.3 Patients page

- A **Possible duplicates** filter that lists pairs scoring `certain`/`strong` against each other (section 9).

---

## 7. Server: `/api/entries` and the routes that make patients without a person deciding

- The client sends either `patient_id`, or `new_patient: true` (the pharmacist chose New patient), or neither (old clients, Halo, repeats).
- **`patient_id`:** as now, check that it belongs to this pharmacy.
- **`new_patient: true`:** create the record with all the scanned fields (DOB, eircode, numbers).
- **Neither:** run `matchPatients`.
  - Exactly one `certain` → link it.
  - Otherwise → don't guess. For an interactive save, return `409 { code: 'PATIENT_CHOICE', candidates }` and let the client show section 6.1. For non-interactive paths (Halo `pmr_inbox` auto-post, `/api/patients/import`), create a new patient **and** store the best `strong`/`possible` id in a `possible_duplicate_of` audit detail, so it appears under **Possible duplicates** for a person to merge.
- Replace `findOrCreatePatient`'s exact `ilike` with this logic so every path behaves the same.
- Halo inbox items: Halo already knows the TouchStore patient. Add `patient.dob`, `patient.gms` (and the other numbers) to the payload in `HALO_INTEGRATION.md` as optional fields, so these become `certain` matches.

---

## 8. Updating the chosen record

After a patient is picked and the entry is saved:

- **Blank on the record, present on the scan:** fill it in (DOB, GMS/DPS/LTI, MRN, eircode, address). Audit `patient.updated` with `{ fields, source: 'scan' }`.
- **Different on the record:** never overwrite silently. Show "Update the address on Mary Kelly's record to …?" on the saved card. Yes → PATCH.
- Register lines that are already signed are never changed (they're the statutory record).

---

## 9. Merging duplicates that already exist

`POST /api/patients/[id]/merge { into: <id> }` (pharmacist role or above):

1. Both must be this pharmacy's and active.
2. `update cd_entries set patient_id = :into where patient_id = :id`, and the same for any other table that links patients (reminders, notes, reports).
3. Copy fields that are blank on `:into` from `:id`.
4. Set `:id` to `is_active = false, merged_into = :into`.
5. Audit `patient.merged` with both ids and the number of lines moved.

Register lines keep their own name and address text. Only the link moves.

---

## 10. Tests (`tests/unit/patient-match.test.ts`)

Made-up people only. Each row is one probe against a small fixed pool:

| Probe | Expect |
|---|---|
| `O'BRIEN, MARY`, same DOB as Mary OBrien | certain → Mary OBrien |
| `Mary Anne O Brien`, no DOB, same eircode | strong |
| `Seán Murphy` vs `Sean Murphy`, same GMS | certain |
| `Mary Kely`, same DOB **and** GMS | strong (one letter out, DOB + number) |
| `Mary Kely`, same DOB only | possible |
| `Mary Kelly`, different DOB, no numbers | possible, conflict `Different DOB`, not preselected |
| `Mary Kelly`, GMS `1234567A` vs record `1234567B` | possible, conflict "family member" |
| `WILSON PETER` (no comma) vs Peter Wilson, same DOB | certain (swapped order) |
| `Kate Byrne` vs Katherine Byrne, same DOB | strong |
| `Kate Byrne` vs Katherine Byrne, nothing else | possible |
| DOB `03/04/1950` vs `04/03/1950`, same name | possible, `Day and month of DOB swapped` |
| Two existing Mary Kellys, both same DOB | both shown, **none** preselected |
| `John Smith` vs `Jane Smith`, same address | possible (different first name) |
| No one close | empty list → New patient |

Also add one case to `tests/unit/logic.test.mts` (or the route test) showing that `/api/entries` with no `patient_id` and two `strong` candidates returns `PATIENT_CHOICE` and creates nothing.

---

## 11. Order of work

1. `patient-match.ts` + the unit tests (no UI, no DB).
2. Migration 0016 + backfill of `name_key` / `eircode`; keep both up to date on every write.
3. `POST /api/patients/match`.
4. Reader fields (section 3).
5. Scan card patient box (6.1), then the typed supply "Did you mean" (6.2).
6. `/api/entries` and `findOrCreatePatient` changes (7).
7. Fill-gaps / ask-to-update (8).
8. Possible duplicates list + merge (6.3, 9).
9. Update `SCANNING.md` §2 "Patients" and `HANDOVER.md` to point here.
