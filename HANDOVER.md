# Handover: PharmacyCDReg.ie

An electronic Controlled Drug Register for Irish community pharmacy. It is a sister product to PharmacyConsultation.ie, and is built to the IPU eCDR conformance specification.

Read this first, then:
- [README.md](README.md): feature overview, IPU conformance map, Stripe set-up.
- [docs/OPERATIONS.md](docs/OPERATIONS.md): environment variables, migrations, Google sign-in, billing states, deployment.
- [docs/SCANNING.md](docs/SCANNING.md): document reader, invoice and Rx rules, duplicate guard.
- [docs/RX_READER_SPEC.md](docs/RX_READER_SPEC.md): prescription reader spec.
- [docs/DESTRUCTION_AND_QUARANTINE.md](docs/DESTRUCTION_AND_QUARANTINE.md): quarantine, witnessed destruction, the CD Destruction Record Book.
- [docs/HALO_INTEGRATION.md](docs/HALO_INTEGRATION.md): dispensing feed from Halo.
- [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md): backups, the restore test, incident restore.
- [docs/compliance/](docs/compliance/): DPA template and DPIA.

---

## 1. Stack

| Layer | Choice |
|---|---|
| App | Next.js 14 App Router, TypeScript, Tailwind, lucide icons, zod |
| Data / auth | Supabase: Postgres (EU), Auth (password, Google OAuth, TOTP MFA). RLS on with **no client policies**; every read and write goes through server routes using the service key after `requireAccount` / `requireStaff`. |
| Hosting | Vercel (`main` auto-deploys). Domain `pharmacycdreg.ie`. Daily cron for trial reminders. |
| Billing | Stripe Checkout, Customer Portal and webhook (€19/month launch price, free month without a card) |
| Document reading | OpenRouter, zero data retention, fixed model chain led by Gemini 3.8 Flash |

## 2. Code map

```
src/app/                    pages (App Router)
  page.tsx                  marketing home: previews, waitlist, hidden "Pharmacy access"
  dashboard/                the app (behind sign-in + staff PIN)
    page.tsx                registers: bookshelf / table per CD type, start books
    register/[id]/          one register "book": entries, select rows → repeat, stock check, set aside
    scan/                   Scan Rx / invoice
    inbox/                  "To confirm": Halo dispensings
    destructions/           witnessed Sch 2 destruction + CD Destruction Record Book
    search/, patients/, contacts/, audit/, staff/, settings/, billing/, waitlist/ (owner)
  api/                      server routes. Every write goes via requireStaff(…, {write:true})
src/lib/
  access.ts                 requireAccount / requireStaff (aal2, roles, read-only when unpaid)
  stripe.ts                 effectiveStatus, canWrite
  scan-extract.ts           reader (OpenRouter / Anthropic), schemas, explainOpenRouter
  reader-config.ts          fixed MODEL_CHAIN, site-wide key lookup
  secret-box.ts             AES-256-GCM for stored secrets
  quantity.ts, invoice-rules.ts, register-page.ts   reading rules (unit-tested)
  match.ts, product-name.ts brand-aware register matching and display names
  duplicates.ts             duplicate guard on every entry
  quarantine.ts             set-aside totals per register
  demo/                     demo mode + training mode (in-browser mock of the API)
src/data/cd-products.ts     CD catalogue: one product per brand, strengths, schedule paragraph
src/components/dashboard/   shell (sidebar / icon rail), entry form, new-entry chooser, shelf, …
supabase/migrations/        0001–0013 (see docs/OPERATIONS.md)
scripts/                    create-pharmacy.mjs, rule tests, GMS list parser
```

## 3. Core rules: don't break these

1. **The register is append-only.** `cd_entries` and `audit_log` reject UPDATE and DELETE by trigger. A correction is a new row; the original stays, struck through, with a footnote. Balances come from the `cd_ledger` view and are never typed.
2. **Balance can't go below zero.** This is checked on the server for every entry.
3. **One register per product per brand.** Brands are not interchangeable (OxyNorm vs Shortec, fentanyl patch brands). `matchRegister` never posts into another brand's book.
4. **Nothing is recorded automatically.** Scans, Halo dispensings and repeats are all drafts until a pharmacist signs them with their PIN.
5. **Patient returns are not pharmacy stock.** They go in the separate destruction book, never in a register.
6. **No secrets, patient data or personal emails in the repo.** It is public.

## 4. Feature summary

- **Accounts:**
  - Pharmacy sign-in by email + password or Google, with optional 2FA.
  - Per-person staff PIN, auto-lock, and roles (supervising, pharmacist, locum, technician, read-only).
- **Registers:**
  - Bookshelf and table views per CD type.
  - Start books from the CD list, by typing, from a scan, or by snapping the last paper page (which takes the opening balance and date).
  - Add unlisted CDs or brands.
  - Remove unused books.
- **Entries:**
  - Receipt, supply, destruction, correction.
  - Click the next empty row to add one.
  - Select rows Excel-style → **Repeat for today**.
  - Quick-fill for patients, prescribers (incl. the national GMS list), suppliers (Uniphar, United Drug, PCO, IMED, Pluripharm) and witnesses.
  - Usual-doctor and collected-by chips.
- **Scanning:** Rx (fewest steps: Scan Rx → check → sign), invoices and CD dockets, paper register pages. There is a duplicate guard on everything.
- **Destruction:** set aside (quarantine) Sch 2 stock → witnessed destruction; a separate CD Destruction Record Book for patient returns and Sch 3/4 stock.
- **Stock checks** with a required note when the count doesn't match; low-stock level per register. After investigating, a pharmacist can **amend the balance** to the count. This adds a signed STOCK ADJUSTMENT line (`adjustment_in` / `adjustment_out`) with the investigation text; it's refused if the register changed since the count. The investigation can be saved as a note with photos.
- **Dispensing reminders** (`/dashboard/reminders`): daily, weekly, every 2 or 4 weeks, monthly, or every N days. They can be created from selected supply rows on a register. When one is due, there's a badge and a banner; **Record now** posts every line through `/api/entries` (signed, with the balance and duplicate checks), then moves the reminder to its next date. **Skip this time** moves it on without recording anything.
- **Notes** (`/dashboard/notes`): categories you can customise, pins, search, links to a register, and clickable URLs. Photos, scans and PDFs are stored in the private Supabase Storage bucket `cd-notes` and only served through `/api/notes/attachments/:id`. Edits are kept in the audit log.
- **Tamper-evident register** (migration 0013): each line carries a SHA-256 fingerprint chained to the previous line, and the audit trail is chained the same way. **Audit trail → Verify integrity** recomputes them all. A Monday email records each register's latest fingerprint outside the system.
- **Inspector access:** the supervising pharmacist creates a time-limited, revocable, read-only link (`/inspect/<token>`; only a hash of the token is stored). It shows registers, destructions and the audit trail with integrity status, printable, and every view is audited.
- **Late entries:** an entry dated more than a day before today (Irish time) needs a reason, which is written into the line and shown as a "late entry" badge. There's also a paper fallback sheet (`/dashboard/fallback-sheet`) for outages.
- **Requisition supplies:** the supply form has a "requisition" mode for practitioners or businesses (no patient record is created).
- **Require two-step sign-in** (Settings → Security). The last authenticator can't be removed while this is on, and a red banner shows if it goes missing.
- **Full backup:** Settings → Data → Full backup (JSON), supervising pharmacist only, audited. Printing is A4 landscape with page numbers and repeated headings.
- **Help** (`/dashboard/help`), a **Getting started** checklist on the registers page, public **/security**, **/privacy** and **/terms**, an app manifest (install to home screen), error pages with browser-error reporting, `/api/health`, and cookie-free Vercel Analytics.
- **Feedback & ideas** (`/dashboard/feedback`): ideas, problems or other messages, emailed to `ADMIN_NOTIFY_EMAIL`. The site owner sets a status, replies, and can share an idea under a neutral title on the **ideas board**, where pharmacies vote (one vote each).
- **Search:** drug dropdown by strength, and a patient report (all dispensings for a patient).
- **Audit trail, print and CSV export** for inspection.
- **Training mode:** a temporary copy of the pharmacy's register in the browser, under an orange bar. Nothing is saved, and it is cleared on refresh.
- **Demo mode:** `NEXT_PUBLIC_DEMO_MODE=1` builds a self-contained sample pharmacy. The home-page previews use it.

## 5. Site owner (ADMIN_EMAILS)

An account whose email is in `ADMIN_EMAILS`:
- Is always treated as complimentary.
- Sees the **Waitlist** and **Halo** settings.
- Sets the **site-wide OpenRouter key** in Settings → Document reader.

Other pharmacies never see API keys or model choices.

## 6. Testing

```bash
npx tsc --noEmit                       # types
npx next lint --dir src                # lint
npx tsx scripts/test-invoice-rules.ts  # invoice quantity / reference rules
npx tsx scripts/test-register-page.ts  # paper-page opening-balance rules
npm run test:unit                      # reminders, late entries, stock effects
npm run test:e2e                       # click-through of the demo build (needs it running on :3200)
NEXT_PUBLIC_DEMO_MODE=1 npx next build && npx next start -p 3200   # click-through demo
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every push. Migrations were tested on a local Postgres 16, including the hash-chain backfill and a tamper test (a direct edit is detected at the exact line).

## 7. Outstanding / to do

- [ ] **Stripe:** create the product and price, webhook and portal (README → Stripe setup); set `STRIPE_*` and `CRON_SECRET`.
- [ ] **Google sign-in:** finish the Google Cloud client and Supabase provider set-up (docs/OPERATIONS.md §3).
- [ ] **Migrations:** confirm 0009–0013 have been run in production.
- [ ] **Company details:** set `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_COMPANY_ADDRESS` and `NEXT_PUBLIC_CONTACT_EMAIL`. Have a solicitor review /privacy, /terms and `docs/compliance/DPA_TEMPLATE.md`.
- [ ] **Hardening checklist:** `docs/OPERATIONS.md` §6 (uptime monitor, leaked-password protection, backups and restore test).
- [ ] **Multi-premises groups:** one login across several pharmacies, with a switcher and group pricing. Not built yet; the data model is one pharmacy per login.
- [ ] **Reminders:** consider an email or push notification for due reminders (they're in-app only for now).
- [ ] **Launch:** set `SIGNUPS_OPEN=1` and remove the `SIGNIN_UNLOCK_CODE` gate when ready.
- [ ] **IPU evidence pack:** update DEC-001 (data processing) to name OpenRouter with zero data retention as the reader.
- [ ] **Reader evaluation set:** build a set of anonymised Rx and invoice images with expected outputs, to measure accuracy before and after model changes.
- [ ] **Halo:** import Halo's CONTROLLED drug list to widen the catalogue (some brand and strength variants are missing; users can add them by hand meanwhile).
- [ ] **PSI wording:** re-check the destruction and quarantine guidance against current psi.ie text (it couldn't be fetched during the build).

## 8. Known limitations

- Training mode needs a live sign-in to test end to end. The demo exercises the same mock layer.
- The catalogue (`cd-products.ts`) covers common Irish Schedule 2 products, not every presentation.
- Reading accuracy depends on photo quality. Handwritten quantities are always flagged for checking.
- The CD Destruction Record Book stores the drug as free text. It isn't linked to the catalogue, by design, because returns can be anything.
