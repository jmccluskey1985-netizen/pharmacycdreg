# Scanning: prescriptions, invoices and paper register pages

Scanning only **reads**. A pharmacist checks and signs every entry before it reaches a register, and nothing is recorded automatically. The full field-by-field spec for prescriptions is in [RX_READER_SPEC.md](RX_READER_SPEC.md).

## 1. Reader and privacy

**Recommended reader: Google Vertex AI in the EU** (migration 0014, Settings → Document reading → Google Vertex AI).
- **Where it runs:** Gemini on Google Cloud. The EU multi-region endpoint (`https://aiplatform.eu.rep.googleapis.com`, location `eu`) keeps ML processing in the EU. Single EU regions can be chosen instead.
- **Contract:** covered by the Google Cloud Data Processing Addendum. Customer data isn't used for training.
- **Models:** `gemini-3.8-flash` first, then `gemini-2.5-flash` if 3.8 isn't served in that location (`VERTEX_MODELS` in `src/lib/reader-config.ts`). **Test** shows which one answered.
- **Auth:** a service account with the role *Vertex AI User*. Its JSON key is uploaded once by the site owner and stored encrypted (`site_secrets.vertex_sa_enc`). The app signs a JWT and swaps it for an access token (`src/lib/vertex.ts`).
- **Request:** `generateContent` with the photos as inline data and `responseMimeType: application/json`, plus `responseJsonSchema`. If the schema is rejected, it retries with plain JSON and the schema in the instructions. Either way the reply is validated.
- **Tests:** `tests/unit/vertex.test.mts` runs against a fake Google: URLs, token, model fallback, schema fallback, error messages.

**Alternative: OpenRouter** (below). Its standard DPA asks customers not to send sensitive data unless agreed, and a signed DPA needs its Enterprise plan. It's kept only as a fallback option.


- **Provider:** OpenRouter, with the same account set-up and privacy settings as Halo.
- **Every call sends:**
  ```json
  "provider": { "zdr": true, "data_collection": "deny", "require_parameters": true }
  ```
  Only zero-data-retention endpoints are used. A model with no ZDR endpoint is skipped and the next one in the chain is tried.
- **Models:** fixed in code, `src/lib/reader-config.ts` (`MODEL_CHAIN`), and not changeable in the app:
  1. `google/gemini-3.8-flash` (primary)
  2. `qwen/qwen3-vl-235b-a22b-instruct` (fallback)
  3. `qwen/qwen2.5-vl-72b-instruct` (fallback)
- **Key:** set **once, site-wide**, by the site owner in **Settings → Document reader**. The site owner is any email in the `ADMIN_EMAILS` env var.
  - Stored encrypted (AES-256-GCM, `src/lib/secret-box.ts`) in `site_secrets` (id `reader`), from migration 0009.
  - Other pharmacies never see or enter a key.
  - `OPENROUTER_API_KEY` in the environment is a fallback.
  - **Test** in Settings runs a real call and shows the provider's actual error if one comes back (`explainOpenRouter`).
- **Legacy fallback:** if there is no OpenRouter key, `ANTHROPIC_API_KEY` (Claude direct) is used.
- **Output format:** the reader first asks for a strict `json_schema` response, and falls back to `json_object` with the schema in the prompt. Parsing is tolerant: zod `preprocess` and `catch`, so one odd field doesn't lose the whole read.
- **Images:** compressed in the browser (`src/lib/compress-image.ts`) before upload. Rotated photos are fine.

## 2. Prescriptions (`/dashboard/scan`, "Scan Rx")

- **Flow:** **Scan Rx** at the top of every page → snap → it reads automatically.
- **What is read:** patient (name, split into first name and surname, address, eircode, DOB, GMS/DPS/LTI number, hospital MRN), prescriber, the CD item(s), the quantity in words and figures, dose and units per dose.
- **Quantity rules** (`src/lib/quantity.ts`):
  - Schedule 2/3 prescriptions need the total in **words and figures**. A quantity written in words only is accepted.
  - A quantity given only as doses is calculated, and flagged.
  - A handwritten quantity is flagged for checking.
  - Pack size is sense-checked.
- **Matching** (`src/lib/match.ts`) is **brand-aware**:
  - OxyNorm, Shortec, and different fentanyl patch brands each have their own register. One brand is never posted into another brand's book.
  - If only another brand's book exists, the card says so and offers **Start book**, pre-filled from the scan.
- **OST forms** (methadone / buprenorphine): see 2a below.
- **Patients** (`src/lib/patient-match.ts`, migration 0016; spec in [PATIENT_MATCHING.md](PATIENT_MATCHING.md)):
  - Names are normalised (accents, apostrophes, `O Brien`/`O'Brien`, `Mc Guinness`/`McGuinness`, surname-first hospital stickers) and compared allowing one misread letter and short forms (Kate/Katherine).
  - The scan card shows **Is this one of your patients?** with each near-match and why it matched (DOB, GMS, eircode, address) or differs. A single certain match is pre-selected. **New patient** is always offered; choosing it despite a very likely match needs a second tap and is audited (`patient.created_despite_match`).
  - Typed supplies get the same question when the name looks like an existing patient (`409 PATIENT_CHOICE` from `/api/entries`).
  - Blank fields on the chosen record are filled from the script. A different address is only overwritten if the pharmacist ticks it. The register line always keeps the script's own text.
  - Halo, repeats and reminders link a single certain match; otherwise they make a new record and note the near-match (`patient.possible_duplicate`).
  - **Patients → Possible duplicates** lists records that look like the same person; a pharmacist can merge them (`POST /api/patients/[id]/merge`, audited `patient.merged`).
  - PPS numbers are not read or stored.

## 2a. OST prescriptions (methadone / buprenorphine in instalments)

The purple HSE **Opioid Substitution Treatment Prescription Form** (GMS010-8082) is recognised automatically (`ost` in the reader output; rules in `src/lib/ost.ts`, unit-tested in `tests/unit/ost.test.mts`).

- **Read:** serial no., treatment card no., drug as written (e.g. Methadone DTF 1mg/ml, Methadone HCl), dose a day × days, total in figures and words, from/to dates, instalment and supervision boxes, and **every row of the pharmacy's DATE DISPENSED grid** (date, quantity, S = supervised / TA = take-away).
- **Today:** all rows dated today (e.g. 90 supervised + 540 take-away) become **one supply line for today** in the matching register (brand-aware: each methadone product has its own book), deducted from its balance. The line carries `OST <serial>` as its reference and the breakdown in its notes.
- **Earlier rows:** shown with their register status. Any date not in the register yet is offered as a **late entry** (reason required).
- **Held:** the form, its schedule and every dispensing are kept (`ost_prescriptions`, `ost_dispensings`, migration 0022). Each register line links back to the form's row for that date.
- **Checks:** words vs figures (the smaller total is used), dose × days vs total, dispensed so far vs total, script start/end dates, rows dated in the future, unreadable rows (never guessed), methadone written without form/strength, strengths other than 1mg/ml.
- **Duplicate guard:** the same form on another day is expected; the same form twice on the same day is blocked.
- Methadone oral solution is counted in **ml** (1mg/ml, so 90 mg = 90 ml).
- **Drug code** (pharmacy section, e.g. 46115): read from the form. The first time a pharmacy records a supply from a form with a given code, the code is remembered against that register (`ost_drug_codes`, migration 0023). Later forms with the same code go straight to that register, ahead of matching the written drug name. Different codes (e.g. different methadone makers) can point to different registers.
- **OST patient list** (Patients → OST patients): patients flagged OST, with their **treatment card no.**, usual product (register), dose and collection days. The treatment card is issued to one person, so a card match with a similar name is a certain match (a different card is a conflict). Each recorded OST supply keeps the patient on the list with their card.
- **From bag labels** (Patients → From bag labels; also a one-off Getting started step when the pharmacy keeps a methadone / buprenorphine book): lay out a bag label for each OST patient and photograph them. Plain bag labels (date, name, address, charge line) are read, including the dispensing system's patient code in brackets, e.g. "(F12)" (`patients.pmr_code`). Choose the product once for everyone, check, and save to the OST list. Each person is matched to an existing record where possible. The photos aren't kept. The code, like the treatment card, then identifies the patient with certainty.

## 2b. Desktop scanners (PC)

A web page can't drive a scanner directly, so on a PC the Scan page watches the folder the scanner saves to (Chrome / Edge, File System Access API). The pharmacist picks the folder once (Scan → *Scanner on this computer* → Connect scanner folder); the folder handle is kept in this browser's IndexedDB only. Files already in the folder are ignored; each new PDF/JPEG/PNG is picked up once its size settles (a prescription is read straight away, invoice pages are added for Read). Nothing in the folder is changed or deleted. Drag-and-drop and Ctrl+V paste also work. Other browsers: choose the file from the scanner's folder.

## 2c. Stock check against a dispensing report

Stock check → *Check against a dispensing report*: a CD report from the dispensing system (PDF, photo, or CSV/text export, sent as text) is read for this register's product only (`src/lib/report-reconcile.ts`). Each line is matched to a register line of the same kind within ±2 days, same quantity, and agreeing name or reference (`reconcile`, unit-tested). Results: *in the register*, *missing* (ticked by default, with a ready draft: patient record address where matched, supplier address from contacts), or *quantity differs* (shown only; fixed by a correction). Ticked lines are posted one by one through `/api/entries` (receipts first, then by date), so the duplicate guard and the late-entry rule apply: lines older than a day carry `Late entry: <footnote>`. Photos of printed reports (e.g. a *Drug Search Report*: Date Dispensed, Patient Name surname-first, Script Dispensed As, Qty) are read row by row along the slant, shadows and fingers ignored. If the page edge cuts off part of a date, the reader reports it with `?` for the missing digit; `dateOptions` lists the possible days (never in the future) and the register decides which one matches. If none does, the line is shown missing but not ticked, and the pharmacist picks the day. The report isn't stored; an audit event records the counts.

## 2d. Reader and robustness notes

- Reader: Google Vertex AI (Gemini 3.8 Flash, EU). If Vertex is configured but its key fails, scanning stops with a message; it never falls back to OpenRouter with patient data.
- OST forms: dates ("17/11/26"), S / TA, product names and summed quantities are normalised; each grid row is checked on its own; an OST form that comes back without its grid is read once more with a focused OST-only request.
- Brand matching: a docket's brand matches a book whose brand contains it ("Rowex" → "Methadone Rowex", "DTF" → "Methadone DTF"); different brands never mix. Methadone Rowex is in the catalogue.

## 3. Invoices / CD dockets (Uniphar, United Drug, PCO, IMED, Pluripharm)

The rules are in `src/lib/invoice-rules.ts`:

- **Quantity** = packs × pack size. Pack size comes from the description (e.g. "28", "5x10") when it isn't printed separately.
- **Reference:** the **invoice / docket number**, never the account number. `checkReference` rejects account-number-looking values.
- **Pharmacy's own details:** rejected as the supplier (`looksLikeOwnPharmacy`).
- **Supplier names:** known suppliers are normalised (`KNOWN_SUPPLIERS`) and remembered in Doctors & suppliers.

Tests: `npx tsx scripts/test-invoice-rules.ts`.

## 4. Paper register pages

- **One photo per drug of the latest page:**
  - Dashboard → New CD book → **Snap paper pages**, or
  - `POST /api/scan/register-page`.
- **What it does:** reads the product and the last lines. `src/lib/register-page.ts` (`decideOpening`) then checks that the running balance adds up and picks the **balance brought forward** and its date.
- **If the balance doesn't add up,** both options are shown: "as written" or "by the sum". The pharmacist counts the stock and picks one.
- **Result:** a new register, blank apart from the opening balance.

Tests: `npx tsx scripts/test-register-page.ts`.

## 5. Duplicate guard (`src/lib/duplicates.ts`)

Runs on **every** entry posted through `/api/entries`, whether it was scanned, typed, from Halo or a repeat.

| Situation | Result |
|---|---|
| Same invoice number already in this register | **Blocked** |
| Receipt of the same quantity in this register within 4 days | Warning |
| Same patient + same prescription reference | **Blocked** |
| Same patient + same quantity on the same day | **Blocked** |
| Same patient + same quantity within 3 days, same prescriber | Warning |

To override, send `allow_duplicate: true` with a `duplicate_reason` of at least 5 characters. The override is audited.

## 6. Status endpoints

- `GET /api/scan/status`: whether a reader is configured. The UI uses it to hide or show scan buttons.
- `POST /api/settings/reader/test`: site owner only.
