# Halo Rx reader: spec for replicating it in PharmacyCDReg

Source: Halo 1.4.69, `desktop/server.py` `/api/cloud_extract` (lines ~13249–14645) plus the helpers it calls. Written 12 Nov 2026.

This is what Halo does today, and the gaps between that and PharmacyCDReg's `src/lib/scan-extract.ts`. CDReg already copies part of it: OpenRouter, zero data retention, a fallback model list, temperature 0. Port the rest in the order of section 9.

---

## 1. Model and routing

| Setting | Halo value | Why |
|---|---|---|
| Gateway | OpenRouter `https://openrouter.ai/api/v1/chat/completions` | one key, many providers |
| Primary model | `google/gemini-3.8-flash` | Won a 5-way test on 14 of his scripts (6 High Tech, St James's discharges, GP pads, a Healthmail print, one upside down). Gemini 3.8 Flash: 42/42 drugs, 42/42 durations, 0 made-up items. Gemini 3.1 Pro: 42/42, about 3× the cost. GPT-5.4: 39/42, 3 made up, about 4× the cost. Qwen2.5-VL 72B: 37/42, 5 made up. Chosen 3 Oct 2026. |
| Fallbacks (`models`, max 3) | `[gemini-3.8-flash, qwen/qwen3-vl-235b-a22b-instruct, qwen/qwen2.5-vl-72b-instruct]` | OpenRouter moves to the next model when one is rate-limited or down |
| `provider` | `{allow_fallbacks: true, sort: "throughput", data_collection: "deny", zdr: true}` | another company's hardware for the same model; never a provider that keeps or trains on scripts |
| `temperature` | `0` | |
| `max_tokens` | `4000` first call, `16000` on retry (see §4) | a 12-item hospital Rx is about 3,000 tokens |
| `response_format` | `{"type": "json_object"}` | **not** strict `json_schema` (see below) |
| Timeout | 120 s | |
| Headers | `Authorization: Bearer <key>`, `X-Title` | |
| Cost | about $0.016 per scan (17 Oct audit of 339 scans) | |

**For CDReg:**
- Set `OPENROUTER_MODELS=google/gemini-3.8-flash,qwen/qwen3-vl-235b-a22b-instruct,qwen/qwen2.5-vl-72b-instruct`.
- CDReg sends strict `json_schema` plus `require_parameters: true`. That only routes to endpoints that support structured outputs, and the Qwen fallbacks' ZDR endpoint (Parasail) may not, so the fallback chain can quietly shrink to one model. Two choices:
  - keep strict schema and accept Gemini-only, or
  - switch to `json_object` and validate with zod afterwards, the way Halo does.

  Test this with one call per model before deciding.
- Add `sort: "throughput"` and `allow_fallbacks: true`.

## 2. Image preparation

Before sending:
- A JPEG of 6 MB or less goes **unchanged**.
- Anything else (PNG, HEIC-converted, very large files):
  1. apply the EXIF rotation
  2. flatten transparency onto white
  3. convert to RGB
  4. shrink to fit 2200×2200 (Lanczos)
  5. save as JPEG, quality 90.

  Some providers reject large PNG data URLs before the model ever sees them.
- Send it as a `data:<mime>;base64,` `image_url`. One image per scan. High Tech forms get a second, close-up image (§6).
- Redaction is **off** by default. A bounding-box PII redactor masked 60–70% of the page and lost 7+ drugs per Rx. Rely on ZDR instead.

**For CDReg:** add `sharp` (Node) for this step. PDFs can stay as OpenRouter `file` parts.

## 3. The prompt (verbatim)

A single user message: this text, then the image. No system message.

```text
Extract a strict JSON object from this Irish prescription image.
{ "name": "FULL NAME AS WRITTEN",
  "first_name": "FIRST NAME (forename) ONLY",
  "surname": "SURNAME / LAST NAME ONLY",
  "address": "FULL POSTAL ADDRESS as one line — combine house number / street / town / county / eircode if present",
  "dob": "DD/MM/YYYY", "ppsn": "...", "gms": "...",
  "dps": "...", "lti": "...", "mrn": "...",
  (gms / dps / lti: the WHOLE number, letters included - a card number may be printed with gaps, e.g. "1234567 A" or "12 34 567A"; give it with the gaps removed, "1234567A". Never drop a letter that stands on its own after a space.)
  "rx_type": "community|hospital|hightech|dental|unknown",
  (dental: the GMS "Dental Treatment Services Scheme" form a dentist writes on - "DENTIST'S NAME", serial "DT ...")
  "table_form": true/false (true ONLY when the drugs are hand-written into a TABLE with the column headings Drug Name | Dose | Frequency | Route | Duration, under an "Rx:" box - a clinic form),
  "upside_down": true/false,
  "discharge_date": "DD/MM/YYYY",
  "prescription_date": "DD/MM/YYYY",
  "weight_kg": 72.5, "weight_date": "DD/MM/YYYY",
  "prescribing_hospital": "name as printed on the pad",
  "prescriber_name": "doctor full name as printed",
  "prescriber_mcn": "Medical Council Number / IMC number",
  "arrangements": ["HRT", "PrEP", ...],
  "scheme_cards": [{"scheme_type": "GMS|DPS|LTI|unknown", "card_title": "heading as printed", "number_label": "label beside the scheme number", "card_number": "...", "ppsn": "...", "name": "...", "dob": "DD/MM/YYYY", "valid_to": "...", "confidence": "high|medium|low"}],
  "image_dims": [width_pixels, height_pixels],
  "drug_list_first_y": 1100,
  "drug_list_last_y": 2050,
  "document_type": "prescription|replacement_request|delivery_note|invoice|other",
  "items": [{"drug": "...", "dose": "...", "frequency": "...",
              "route": "PO|SC|IM|IV|topical|inhaled|vaginal|other as written, or null",
              "quantity": "...", "duration": "as written or null",
              "repeats": "as written or null",
              "comment": "a note written for this item, or null",
              "y_pixel": 850,
              "box_2d": [ymin, xmin, ymax, xmax]}] }
document_type: "prescription" for any prescription. A High Tech Arrangement Application for Replacement Medicines is a "replacement_request", not a prescription. A wholesaler delivery note or invoice (United Drug, Uniphar, 'GOODS SENT', 'DELIVERY NOTE', prices and order numbers, no patient) is "delivery_note" / "invoice": still list its lines as items.
A bracket or brace drawn across several rows (e.g. '} 3 months' beside two drugs) applies what is written beside it to EVERY row it spans: give each of those items that quantity/duration.
route: copy the administration route exactly when printed (for example PO, SC, topical or vaginal); null if none. Never omit SC or vaginal because route determines the product formulation. duration: copy a duration such as '7 days', '2/52' or '3/12' here, never into quantity. repeats: a repeat instruction exactly as written ('x2', 'Rpt x 6/12', '3/12'); null if none. comment: a note the prescriber wrote about that item (a comment box, special instructions); null if none.
box_2d: for every item, the box around that item's line(s) on the page - drug name and its directions - as [ymin, xmin, ymax, xmax] scaled 0-1000 over the image you see (0,0 top left). Required; it places the item's number on the scan, so draw it around the ink that is actually there, handwritten or printed.
image_dims: [width, height] in pixels of the image you can see. Required so the UI can convert pixel values into rendered coordinates.
drug_list_first_y / drug_list_last_y (CRITICAL — placement anchors): the y-PIXEL of the VERY FIRST drug entry (its drug-name line) and the y-PIXEL of the VERY LAST drug entry (its drug-name line), in the image you can see. The UI uses these two y-values to bound where numbered badges go — badges should sit on drug rows, NOT on the patient block above (name/DOB/MRN/address) and NOT on the prescriber signature/consultant line below. If you can see the drugs, you MUST return both values; setting them too wide (e.g. y=0 or y=image_height) will put badges on non-drug content. Be conservative — drug_list_first_y is BELOW the patient address; drug_list_last_y is ABOVE the prescriber signature.
y_pixel (per item, OPTIONAL): the y-pixel of each drug NAME if you can identify it precisely. Drugs are NOT evenly spaced — multi-line entries take more vertical room than single-line ones — so report each drug's actual y, not an estimated even distribution. If unsure, omit y_pixel and the UI will fall back to drug_list_first_y/last_y bounds.
upside_down: TRUE only if the page is rotated 180 degrees — the text runs bottom-to-top and you had to read it inverted. You are the most reliable orientation check available, because you are reading the actual words; the pixel heuristic that runs before you cannot separate an upright page from an inverted one when the margins are even. If the page reads normally, return false.
ADDRESS RULES: address is the patient's home address — not the pharmacy address, not the prescriber's clinic. On Irish Rxs it appears under labels like 'Address:', 'Patient Address', or directly under the patient name. Combine all address lines (street, town, county, eircode) into a single comma-separated string. Eircodes are 7 chars like 'D02 XR68'. If no patient address is visible (common on hospital pads with addressograph stickers that only show name + DOB), return null — do NOT use the hospital address or pharmacy address as a fallback.
PATIENT NAME RULES (critical — most common failure mode is confusing the HOSPITAL name with the PATIENT name):
 1. The patient name is the PERSON RECEIVING the prescription. It NEVER equals the hospital name, the doctor's name, the ward name, or the pharmacy name.
 2. On hospital pads it sits in a labelled block — look for labels like 'Patient Name', 'Name:', 'Patient:', 'Surname/Forename', 'Surname:', 'Forename:', 'Patient Details'. The value is on the SAME LINE or directly UNDER the label.
 3. The hospital letterhead at the top of the page (e.g. 'St James's Hospital', 'Beaumont Hospital') is the prescribing_hospital, NEVER the patient name. If you see the same word(s) in both the letterhead and a labelled Patient field, only the labelled field is the patient.
 4. If you cannot find a labelled patient block, set name/first_name/surname all to null. Do NOT guess by picking 'the most prominent name on the page' — that's how the hospital ends up wrongly tagged as the patient.
Irish hospital pads usually print SURNAME first, then forename (sometimes separated by a comma). Always split the patient into first_name + surname correctly regardless of what order they appear on the page. Example: "WILSON, PETER" → first_name=PETER, surname=WILSON. Multi-word surnames like "MC GUINNESS" or "O CONNOR" stay together as the surname.
ADDRESSOGRAPH STICKERS (hospital pads, e.g. St James's): a printed label stuck over the patient box, in this order - a hospital code line (e.g. 'SJH'), then 'SURNAME, FORENAME' (the PATIENT), then the address lines, then MALE/FEMALE, then the date of birth; an MRN/barcode number sits beside it. The line straight after the code is the patient's name - the lines after it are the ADDRESS, never the name. The name on the sticker is NEVER the prescriber: prescriber_name comes only from the 'Prescriber Name' / signature box at the bottom (null if unreadable).
NEVER INVENT: copy only words you can actually see on the page. If a field is not there, return null. An address that is not printed on the page is worse than no address.
HIGH TECH: the HSE 'HIGH TECHNOLOGY MEDICATIONS PRESCRIPTION FORM' (serial number starting HTP, 'Part 1 - Hospital and Patient Details', 'Part 2 - Prescribed Drugs Details') is rx_type "hightech", even though a hospital wrote it.
dob comes ONLY from the patient's 'Date of Birth' box or addressograph sticker. A date in a pharmacy stamp, a 'date' box or the prescriber's signature line is NOT the date of birth: an empty DOB box is null.
discharge_date applies only when rx_type=hospital. Look for phrases like 'Discharge Date', 'D/C', 'Date of Discharge'. Leave null on community Rxs.
prescription_date: the date this prescription was written or issued. Search the WHOLE page - it is often small and away from the drugs. Where it is on his scripts: a 'Date:' box with the date HANDWRITTEN on the line (e.g. 'Date: 8 / 9 / 26'), often top right or beside the signature; 'Date of issue' / 'Issue date'; 'Date printed' / 'Printed' at the BOTTOM RIGHT of hospital computer scripts and charts (often with a time); or a date on its own beside the prescriber's signature or stamp at the bottom. NEVER: the date of birth (DOB, Birthdate, born), 'Date of weight', admission, review, start/stop, 'until' or other plan dates, or a pharmacy stamp. A hospital discharge script with no other date: the discharge date. Give it as DD/MM/YYYY with a four-digit year (8/9/26 -> 08/09/2026, 2-Jun-2026 -> 02/06/2026); null only if the page really has no such date. Read a handwritten YEAR carefully: '26' is easily misread as '20' or '24' - copy the digits that are actually written.
weight_kg: the patient's weight in kg when the page prints one - hospital charts and discharge scripts often have 'Weight', 'Wt' or 'Weight (kg)' with a 'Date of weight'. A number only; weight_date is that date as DD/MM/YYYY. null when no weight is printed - never guess one.
prescribing_hospital: capture the hospital name verbatim from the letterhead, footer, or stamp. Examples: 'St James's Hospital', 'St. James's Hospital, Dublin 8', 'SJH', 'Mater Misericordiae', 'Beaumont Hospital', 'St Vincent's University Hospital'. Leave null on community Rxs (GP-only).
prescriber_name + prescriber_mcn: the doctor who signed/printed the Rx. MCN is the Irish Medical Council registration number, usually 5-6 digits, often labelled 'IMC No', 'MCN', or 'Reg No'.
arrangements: include 'HRT' if the Rx is stamped or marked as HRT (menopause arrangement), 'PrEP' for HIV pre-exposure prophylaxis. Empty array if neither.
PHYSICAL IRISH SCHEME CARDS: the scan may include an HSE card beside or on top of the prescription, at any angle, in an old or new layout, and with English or Irish labels. Inspect the entire image and return EVERY visible card in scheme_cards. 'Medical Card', 'Carta Leighis', 'GMS Number', 'Uimhir SGL', 'Card Number', or 'Uimhir an Charta' identifies a GMS card. 'Drugs Payment Scheme', 'Sceim Iocaiochtai Drugai', 'DPS Number', or 'Uimhir SID' identifies a DPS card. Preserve a final household/member letter in card_number and remove visual spaces between its characters. card_number MUST be the value beside the scheme's number label. PPSN belongs only in ppsn. NEVER use Panel No, date of birth, valid-to/expiry date, card review number, issue number, or a phone number as card_number. If exactly one physical card is visible, the top-level name/ppsn/gms/dps/lti fields should agree with that card. If several patient cards are visible, leave top-level card/patient identity fields null unless independently printed on the prescription; keep each card separate and never combine details between cards. Use an empty scheme_cards array when no physical card is visible.
items: EXTRACT EVERY DRUG LINE on the prescription. Do NOT summarise, group, abbreviate, or skip any item — even if there are 15 or more. Output them in the SAME TOP-TO-BOTTOM ORDER they appear on the page. If a line is partly cut off or illegible, still emit an entry with whatever you can read in drug + a brief '(unclear)' note in dose. Missing items is a worse failure than a partially-read item. Over-the-counter products and emollients (e.g. Canesten cream, Silcocks base) are drug lines too - list them. If an item's line or its notes say NO PRESCRIPTION GIVEN (or no prescription supplied / issued), STILL list it and add "no_rx_given": true to it. If a drug line has been CROSSED OUT / struck through / scored off by hand (a pen line through it), STILL list it and add "crossed_out": true to it.
y_frac: vertical centre of each drug's printed line as a fraction of the FULL image height — 0.0 = top, 1.0 = bottom. Estimate from where the drug name sits on the page. Required for every item so the UI can anchor index badges to the right lines. y_norm_note can be omitted (it's just a reminder).
quantity (per item): the NUMBER OF UNITS written on the script for that drug — the amount to dispense. '30', '1 OP' -> 30 / 1 respectively; '2 packs' -> 2. Digits only when a plain number is written. This is the quantity PRESCRIBED, and on an Irish script the quantity dispensed is normally the same number. Leave it empty ONLY if no quantity appears anywhere on that line — do not calculate one from the dose and the duration, and do not guess.
Use null for missing fields. Drug names verbatim. Return JSON only.
```

### What CDReg's prompt lacks that Halo's has
CDReg's system prompt is built for invoices first. Its prescription half should take these rules from Halo's prompt above:
- **Patient name rules 1–4.** The hospital letterhead is never the patient. Name comes only from a labelled patient block, otherwise null.
- **Addressograph sticker order.** Code line, SURNAME, FORENAME, address, sex, DOB. The sticker is never the prescriber.
- **Address rules.** The patient's home address only, never the hospital's or pharmacy's. Null if it isn't printed.
- **DOB rules.** Only from the DOB box or sticker; a stamp date is not a DOB.
- **Prescriber** comes from the Prescriber Name/signature box. MCN: 5–6 digits, labelled IMC No / MCN / Reg No.
- **`prescription_date` search list.** Includes the year-misread warning.
- **`document_type`.** Adds `replacement_request` and `delivery_note`.
- **Bracket/brace rule.** A bracket across several rows applies to every row.
- **Item flags.** Emit `crossed_out` and `no_rx_given` instead of dropping the item.
- **Every line, in page order.** Missing an item is worse than a partly read one.
- **High Tech form recognition.** Serial starts HTP.
- **`upside_down`.**

## 4. Calls, retries and failures

Run these in order:

1. **402 with a "can only afford N tokens" message.** Retry once with `max_tokens = min(3000, N)`, but only if N ≥ 800. Lower than that risks a truncated drug list.
2. **429 (not a credit problem), or 402 "in-flight budget".** Up to 4 retries, waiting 2, 5, 10 and 15 s. If `Retry-After` is a number, wait `max(own wait, min(30, Retry-After))`.
3. **Other non-200.** Fail with a message that tells these apart:
   - **No credit:** the 429/402 text mentions credit or balance. Tell the user to top up.
   - **Busy upstream:** `error.metadata.limit_source` contains `shared_pool` or `upstream`. It's the provider's pool, not this account; try again in a minute.
   - **Bad key or no credit:** 401/402/403.
4. **`finish_reason == "length"`.** Retry once with `max_tokens: 16000` and `reasoning: {max_tokens: 4000}`. Gemini's own reasoning counts against `max_tokens`: one oncology form was still "length" at 8,000 with only 708 characters of answer.
5. **Parse.** Use the robust parser (§5). If it fails, re-read **once** with 16,000 and `reasoning: {max_tokens: 4000}`. If that fails too, report "model returned non-JSON".
6. **Bare list.** If the answer is a list rather than an object: one object containing `items` becomes the answer; otherwise the list is the items.
7. Record which model actually answered (`response.model`); it may be a fallback.

**CDReg today:** it throws on `length` and never retries, and it has no 429 back-off. Port 1, 2, 4, 5 and 6.

## 5. JSON repair

Try each in order and stop at the first that parses:
1. plain parse
2. strip ```` ```json ```` fences
3. slice from the first `{` to the last `}`
4. strip trailing commas `,}` `,]`
5. replace curly quotes with straight ones
6. single quotes to double, only if the text has no `"` at all
7. `jsonrepair` (npm `jsonrepair`)

Log which strategies ran.

## 6. High Tech form

Halo spots the HSE High Technology Medications Prescription Form with **local Windows OCR** (header, HTP serial, sticker) before the call. When it finds one:
- it appends the guide below to the prompt
- it adds a cropped close-up of the Part 2 drug table as a second image
- it reads the sticker's DOB with OCR, which overrides the model's (the model once read a stamp date as a DOB); the sticker's name, address and MRN only fill fields the model left empty
- it splits two strengths for one dose into separate items (Prograf 0.5 mg + 1 mg = 1.5 mg BD)

**For CDReg:** there's no Windows OCR on Vercel. Read it in two passes:
1. The normal prompt returns `rx_type`.
2. If `rx_type == "hightech"`, re-read with the guide appended.

Alternatively, always append the guide; it's worded "THIS PAGE IS…", so you'd need to reword it as conditional. Few CDs are on High Tech forms anyway.

```text
THIS PAGE IS THE HSE HIGH TECHNOLOGY MEDICATIONS PRESCRIPTION FORM (High Tech). rx_type is "hightech". How to read it:
- Part 1 top lines (Hospital Name, Address, Telephone, Eircode, e.g. 'St James Hospital, James Street, Dublin 8, D08 NHY1') are the HOSPITAL - never the patient's address.
- The PATIENT is either a printed hospital sticker stuck over Part 1 (hospital code e.g. SJH and an MRN number, then 'SURNAME, FORENAME', then the address lines, then MALE/FEMALE and the date of birth) or handwritten in the Patient Name / Address Line boxes with the Date of Birth in DD MM YYYY boxes. PPSN in its boxes. Card Type ticks GMS / DPS / LTI / HAA / HTS with the Card Number: put the number in gms / dps / lti to match the ticked box. Each tick box sits to the RIGHT of its label ('GMS [box] DPS [box]'): a tick in the box straight after 'GMS' is GMS, not DPS.
- Part 2 is the drug table: Product/INN | Strength | Form | Dosage | Quantity | Repeat, one row per drug (rows may be numbered 1, 2, 3 in circles). A brand in brackets belongs to the drug: 'Tacrolimus (Prograf)'. Doctors often write in the wrong column (Form 'OD', Dosage 'po'): read the whole row together.
- For each item: drug = Product/INN as written; dose = strength, route and how often, then the Quantity column if it is a duration, e.g. '2.5mg PO BD for 1 month', '200mg oral BD 6/7', '500mg oral 1000mg twice daily 1/12', '480mg PO OD for 3 months'; frequency = the how-often words (BD, OD, Daily, once weekly). On this form the Quantity column is almost always a DURATION ('1 month', '1/12', '6/7', 'For 3 months', '6 month'): quantity stays null unless a plain count of tablets/units is written.
- The Repeat column: copy it into the item's "repeats" exactly as written ('x3/12', '6', 'x2', '-' or 'N/A'); a repeat written anywhere else on the line ('Rpt x 6/12') goes there too.
- The Comment box: copy what is written into "comment" on the item it is about (e.g. 'Please dispense 1mg & 0.5mg tacrolimus for dosing by level' goes on the tacrolimus); a comment for the whole form goes on the first item.
- Also give each item "strength" = the Strength cell exactly as written, and "row" = which table row it is on (1, 2, 3). When the Strength cell lists two strengths for one drug (e.g. '0.5mg' and '1mg' bracketed together beside a 1.5mg dose) keep it as ONE item with both in strength - Halo splits it.
- A pharmacy stamp and anything written on or beside it (e.g. '1/12 disp') is the pharmacy's note, not the prescription. The stamp date is not a date of birth.
- prescriber_name = the Prescriber Name boxes; prescriber_mcn = the HCP No. / Medical Council No. boxes. Part 3 (nominated pharmacy) is empty - ignore it.
- A SECOND IMAGE follows the page: a close-up of Part 2 of this same form. Read the drug rows from it; use the full page for the rest.
```

## 7. Deterministic clean-up after the read ("the model reads, the rules decide")

Halo applies these to the parsed JSON, in this order. Each rule came from a real wrong dispense or near miss.

### 7a. Document level
- **Scheme cards** (`agent/card_extract.py`):
  - card type comes from the printed heading (English or Irish aliases: Carta Leighis, Uimhir SGL, Sceim Iocaiochtai Drugai, Uimhir SID)
  - the card number never comes from the PPSN, panel no., DOB or expiry
  - if exactly one card is visible, it may fill empty top-level fields
  - if several are, they are never merged into one patient
  - *(CDReg: optional.)*
- **Not a prescription:**
  - `document_type` in {replacement_request, delivery_note, invoice, other} means every item is disabled with the reason shown
  - every item comment matching `ordered in error` also means `replacement_request`
- **DOB today or later** becomes null. An empty DOB box was once read as the stamp's month.
- **Prescription date year:** if the day and month are today or yesterday but the year is wrong, use this year (`agent/rx_date.assume_this_year`).
- **Weight** is kept only if it's between 20 and 300 kg.
- **Hospital name** is matched to a canonical list (`agent/reference/hospitals`).

### 7b. Item level, before matching
1. **Continuation rows.** An item whose `drug` is only join words (then/and/with/plus/rest/repeat/rpt/disp/dispense) is folded into the previous item's directions as "then …".
2. **Not-a-drug rows.** Drop an item with no word of 3+ letters other than join words. This caught order numbers and "-> then".
3. **Route/form carried forward.** A repeat row of the same drug and strength takes the previous row's route/form, never its dose or quantity.
4. **"200g" of a tablet is 200 mg.** On a non-topical item, ≥50 g in dose or strength is rewritten to mg.
5. **Quantity normaliser:**
   - a labelled "Total quantity: 420 mL" beats a dose number copied into quantity
   - `5/7`, `2/52`, `3/12`, "7 days" in the quantity column move to `duration`, and quantity becomes null
6. **Repeats.** Only Halo needs these; the register can skip them:
   - "issue x4" means 3 repeats
   - "6/12" means 5 repeats, unless the duration is also 6/12
   - "3 months" is a duration
   - "x 3 injections" or "+6" next to an injectable is the quantity
   - anything unclear is kept as written text
7. **Items kept but never dispensed** (`_enabled = false`), each with its reason:
   - `no_rx_given`, or the text matches "no prescription given/supplied/issued"
   - `crossed_out`, or "crossed out", "struck out" or "discontinued" in the comment
   - a comment like "STOP <this drug>"
   - "on hold", "do not start until", "start pending review"
   - "supplied/dispensed by GUIDE", "information purposes only"
8. **"See instructions" as the dose.** Take the first clause of the Special Instructions as the dose, and leave the item **unconfirmed**.
9. **Merges** (`agent/taper.py`), for counting quantity:
   - a reducing course printed as N lines becomes one item
   - a split daily dose (morning/midday/evening) becomes one item
   - steps (BD 1/52 then OD 3/52) become one item
   - a course written in words ("reduce by 5 mg every 3 days") goes to a second Gemini call that returns only steps `{mg, times_a_day, days}`, and Halo does the maths and checks it
   - *(CDReg: relevant only for doses written as text; the register needs the total quantity in words and figures, so you can skip this.)*

### 7c. Matching to a product
`agent/drug_match.py`, conservative by design. A strength that disagrees means **no match**, never "close enough".
- The strength is pulled out of the drug name before the lookup ("fludrocortisone acetate 100 mcg" → name "fludrocortisone", strength 0.1 mg).
- The `dose` field holds directions, never a strength hint.
- Units are normalised: 100 mcg = 0.1 mg. ml is never compared with mg.
- Order of preference:
  1. learned corrections
  2. this pharmacy's usage list
  3. the national GMS catalogue
  4. otherwise unmatched (OTC)

**For CDReg:** use the same rules against `cd-catalogue` and `matchRegister`. Halo also catches CDs by brand; that list is `agent/rx_validity.py` CONTROLLED and is a draft Jonathan still has to check.

## 8. Caching

- Key: SHA-256 of the image bytes + model + `#p` + the first 8 hex characters of SHA-256(prompt).
- A changed prompt means a cache miss, so a prompt fix reaches old scans.
- Only the words are cached. Matching is redone on every hit, so a matcher fix reaches old reads too.
- "Force" bypasses the cache.
- The cache holds patient data: keep it in the same store as the patient record. Never in logs or diagnostics.

**For CDReg:** a `scan_cache` table keyed per pharmacy, with the same key. It saves a paid call when someone re-uploads the same photo.

## 9. Port checklist for CDReg (in order)

1. Change `OPENROUTER_MODELS` to the Gemini-first chain and decide between strict schema and `json_object` (§1). Test one call per model.
2. Add the `sharp` image step (§2).
3. Merge Halo's prescription rules into CDReg's prompt (§3, "What CDReg's prompt lacks"). Add `crossed_out` and `no_rx_given` to `ItemSchema`, and `replacement_request` and `delivery_note` to `document_type`.
4. Add the retries: 429 back-off, 402 affordable tokens, `length` → 16,000 + reasoning cap, one re-read on non-JSON (§4).
5. Add the robust JSON parser (§5).
6. Add the post-read rules 7a and 7b(1, 2, 4, 5, 7) to `lib/quantity.ts` or a new `lib/rx-rules.ts`, with a test for each rule.
7. Add the image-hash cache (§8).
8. Build an eval set: 20+ real CD scripts with a hand-made key. Score drugs, quantity in words and figures, patient, prescriber and MCN. Only switch models on that score.

## 10. Not portable from Halo (Windows-only or Halo-only)

- **Windows OCR** fills several roles in Halo, none of which CDReg needs to copy:
  - placing item badges on the page
  - correcting misread names from the printed text
  - the printed-date fallback
  - the weight fallback
  - High Tech detection and its table crop
- The learned-corrections database and TouchStore usage list are Halo's own data.
- Local Ollama mode (`qwen2.5vl:32b`) only makes sense on the pharmacy PC.
