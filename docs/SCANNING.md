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
- **What is read:** patient (name, address, DOB), prescriber, the CD item(s), the quantity in words and figures, dose and units per dose.
- **Quantity rules** (`src/lib/quantity.ts`):
  - Schedule 2/3 prescriptions need the total in **words and figures**. A quantity written in words only is accepted.
  - A quantity given only as doses is calculated, and flagged.
  - A handwritten quantity is flagged for checking.
  - Pack size is sense-checked.
- **Matching** (`src/lib/match.ts`) is **brand-aware**:
  - OxyNorm, Shortec, and different fentanyl patch brands each have their own register. One brand is never posted into another brand's book.
  - If only another brand's book exists, the card says so and offers **Start book**, pre-filled from the scan.
- **Patients:** each read is linked to a patient record (`patients`, migration 0008), which is created if the patient is new.

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
