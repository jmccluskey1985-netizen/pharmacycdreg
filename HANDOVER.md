# Handover: PharmacyCDReg.ie

An electronic Controlled Drug Register for Irish community pharmacy. It is a sister product to PharmacyConsultation.ie, and is built to the IPU eCDR conformance specification.

Read this first, then:
- [AGENTS.md](AGENTS.md): short rules and commands for AI coding assistants (ChatGPT / Codex, Claude).
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
| App | Next.js 16 App Router (React 19), TypeScript, Tailwind, lucide icons, zod 4 |
| Data / auth | Supabase: Postgres (EU), Auth (password, Google OAuth, TOTP MFA). RLS on with **no client policies**; every read and write goes through server routes using the service key after `requireAccount` / `requireStaff`. |
| Hosting | Vercel (`main` auto-deploys). Domain `pharmacycdreg.ie`. Daily cron for trial reminders. |
| Hosting | Vercel project **`pharmacycdreg-mlyv`** in team `jmccluskey1985-2581s-projects` (serves pharmacycdreg.ie; the duplicate `pharmacycdreg` project was deleted 18 Nov 2026). Env vars are set there |
| Billing | Stripe Checkout, Customer Portal and webhook, Stripe SDK 23 / API `2026-10-28.endive` (€19/month launch price, free month without a card; groups 25% off each additional pharmacy) |
| Document reading | Google Vertex AI (Gemini 3.8 Flash, EU multi-region), live since 17 Nov 2026, under the Google Cloud DPA. When Vertex is the chosen reader the app never falls back to another provider (a broken key stops scanning with a clear message) |

## 2. Code map

```
src/app/                    pages (App Router)
  page.tsx                  marketing home: animated demos, trust strip + "Your data, security and AI, answered" Q&A band, phone preview, pricing, waitlist, hidden "Pharmacy access"
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
  scan-extract.ts           reader (Vertex AI / OpenRouter / Anthropic), schemas, OST form schema
  ost.ts, bag-labels.ts     OST instalment rules; bag-label reading for the OST patient list
  report-reconcile.ts       stock check vs dispensing report: matching, cut-off dates (unit-tested)
  reader-config.ts          fixed MODEL_CHAIN, site-wide key lookup
  secret-box.ts             AES-256-GCM for stored secrets
  quantity.ts, invoice-rules.ts, register-page.ts   reading rules (unit-tested)
  match.ts, product-name.ts brand-aware register matching and display names
  duplicates.ts             duplicate guard on every entry
  quarantine.ts             set-aside totals per register
  demo/                     demo mode + training mode (in-browser mock of the API)
src/data/cd-products.ts     CD catalogue: one product per brand, strengths, schedule paragraph
src/components/dashboard/   shell (sidebar / icon rail), entry form, new-entry chooser, shelf, …
supabase/migrations/        0001–0024 (see docs/OPERATIONS.md)
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
  - Per-person staff PIN, auto-lock, and roles (superintendent, supervising, pharmacist, support pharmacist, locum, technician, read-only).
  - **Group overview** (`/dashboard/group`, superintendents with 2+ pharmacies): per pharmacy, registers, entries this week, late entries, reminders due, stock awaiting destruction, overdue stock checks and count mismatches. Counts only, no patient details; audited.
  - A superintendent over several pharmacies: each pharmacy adds them in Team with their own login email; that login gets a pharmacy switcher (sidebar and PIN screen). Switching locks the screen and asks for that pharmacy's PIN, so entries are always signed in the right pharmacy.
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
- **OST (methadone / buprenorphine) forms:** today's supervised + take-away rows become one supply; the form and its instalments are held; missed earlier days are offered as late entries (docs/SCANNING.md §2a).
- **Scanning:** Rx (fewest steps: Scan Rx → check → sign), invoices and CD dockets, paper register pages. There is a duplicate guard on everything. On a PC (Chrome / Edge) the Scan page can watch the scanner's save folder and read each new scan automatically; drag-and-drop and Ctrl+V paste also work (docs/SCANNING.md §2b).
- **OST patient list:** methadone / buprenorphine patients onboarded once from photos of bag labels (name, address, dispensing-system code, treatment card); OST forms are then matched by card or code. Drug codes on forms (e.g. 46115) are learned per register.
- **Destruction:** set aside (quarantine) Sch 2 stock → witnessed destruction; a separate CD Destruction Record Book for patient returns and Sch 3/4 stock.
- **Stock checks** can be checked against a dispensing-system report (PDF, photo or CSV, e.g. a Drug Search Report): lines missing from the register are highlighted and ticked, quantity differences flagged, and ticked lines added in one signed action, as late entries with a footnote when over a day old (docs/SCANNING.md §2c).
- **Stock checks** with a required note when the count doesn't match; low-stock level per register. After investigating, a pharmacist can **amend the balance** to the count. This adds a signed STOCK ADJUSTMENT line (`adjustment_in` / `adjustment_out`) with the investigation text; it's refused if the register changed since the count. The investigation can be saved as a note with photos.
- **CD balances list** (Registers → Balances list, `src/app/dashboard/stock-sheet`): every book's balance and last stock check (due flagged); print/PDF and styled Excel.
- **Email** (`src/lib/email.ts`): sent through Google Workspace as aliases of support@pharmacyconsultation.ie: welcome and invitations from welcome@pharmacycdreg.ie, everything else from support@pharmacycdreg.ie; password resets and invitations are sent by us with one-time links (`src/lib/auth-emails.ts`). Site owner: Settings → Email shows the set-up and sends a test.
- **Stock counts** (Registers → Balances list → tick Stock count; `src/app/dashboard/stock-sheet`, `/api/stock-counts`, migration 0026): count every book over one or more days. Each line saves as you go with the register balance at that moment, its own date/time, who counted and an optional note (hover icon); difference shown 0 green / red. Tick Complete on a row to log it as a permanent stock check in that book (note required if it differs) and lock it; Complete stock count (top and bottom of the table) logs the rest and closes it (finished counts are final, enforced in the database). Start date top right; past counts viewable, printable and in Excel (counts, dates, initials, notes, difference formula). Every completed stock check (from a count or the single-book Stock check button) appears as a line in its register book, in time order: green "STOCK CHECK ✓ Balance confirmed correct" or red with the difference and note, the count's start date and who checked. These lines also show in the CSV export and the inspector's read-only view. They're display only, built from `stock_checks` with no new table, so the hash chain is untouched. A home-page animation (`StockCountDemo`) shows it.
- **Risk assessment** (PSI guidance: those in a statutory governance role assess the risks of electronic record-keeping, with remedial actions, before adopting it). Dashboard → Settings → Risk assessment (`/dashboard/risk-assessment`, also in Getting started and Help): filled in from the account (pharmacy, PSI no., address, supervising/superintendent, changeover date, review date +1 year; checklist ticks from PINs, 2FA, books, stock checks), 13 risks with system controls, suggested local controls and ratings (`src/lib/risk-assessment.ts`, mapped to IPU FR/NFR). Saved as you type; signed with one click by the superintendent or supervising pharmacist (PIN-identified: name, PSI no., time); signed versions can't be changed (migration 0025, trigger) and a review starts a new version. Printable. Public free template at `/risk-assessment` (browser-only storage) for SEO and other systems' users. Sign-up page mentions it.
- **Public guides** (`/guides`, for SEO and for sharing with pharmacists): *Electronic CD registers in Ireland*, *CD stock check with your Touchstore or MPS report*, *From paper to electronic CD register*. List in `src/lib/guides.ts` (feeds the index, sitemap, home-page strip and related links); layout `src/components/guides/guide-layout.tsx`; animations `src/components/guides/animations.tsx` (register line anatomy, tamper chain, count & compare, paper → electronic, scroll-filling step timeline) plus the home-page demos. Article + BreadcrumbList (+ HowTo for the step guides) schema. Legal points are kept general and point to PSI guidance; the "check you can stop paper" callout stays until the amendment is confirmed. Update the `updated` date when a guide is reviewed.
- **Dispensing reports, every book at once** (Registers → Check report, `/api/stock-checks/reconcile-all`): up to 10 photos/pages or files in any format. Each line is put in its book by product (`src/lib/report-match.ts`, same brand/strength rules as scanning), then reconciled like the single-book stock check; products without a book are listed. Formats (`src/lib/report-read.ts`, `report-text.ts`): PDF and photos (recognised by content) go to the EU reader; Excel .xlsx, HTML, RTF, XML, CSV/TXT and any other text file are converted to text first; old .xls / Crystal .rpt get a "save as PDF/xlsx" message. **Touchstore .QRP** (QuickReport: one EMF page per printed page) is read exactly from its own text by `src/lib/qrp.ts` (dispensed date, Qty. Disp, script No., patient, address, prescriber): no AI involved. **CSV exports** (MPS saves its reports as CSV) are read exactly by their column headings (`src/lib/report-csv.ts`: Date Dispensed / Patient Name / Script Dispensed As / Qty and common variants; title lines and totals skipped; comma, semicolon or tab): no AI involved; a CSV without recognisable headings goes to the reader as text. Tests: `tests/unit/qrp.test.mts`, `report-text.test.mts`, `report-csv.test.mts`.
- **Dispensing reminders** (`/dashboard/reminders`): daily, weekly, every 2 or 4 weeks, monthly, or every N days. They can be created from selected supply rows on a register. When one is due, there's a badge and a banner; **Record now** posts every line through `/api/entries` (signed, with the balance and duplicate checks), then moves the reminder to its next date. **Skip this time** moves it on without recording anything.
- **Notes** (`/dashboard/notes`): categories you can customise, pins, search, links to a register, and clickable URLs. Photos, scans and PDFs are stored in the private Supabase Storage bucket `cd-notes` and only served through `/api/notes/attachments/:id`. Edits are kept in the audit log.
- **Tamper-evident register** (migration 0013): each line carries a SHA-256 fingerprint chained to the previous line, and the audit trail is chained the same way. **Audit trail → Verify integrity** recomputes them all. A Monday email records each register's latest fingerprint outside the system.
- **Inspector access:** the supervising pharmacist creates a time-limited, revocable, read-only link (`/inspect/<token>`; only a hash of the token is stored). It shows registers, destructions and the audit trail with integrity status, printable, and every view is audited.
- **Late entries:** an entry dated more than a day before today (Irish time) needs a reason, which is written into the line and shown as a "late entry" badge. There's also a paper fallback sheet (`/dashboard/fallback-sheet`) for outages.
- **Requisition supplies:** the supply form has a "requisition" mode for practitioners or businesses (no patient record is created).
- **Roles & permissions** (Settings → Roles & permissions, `src/lib/permissions.ts`): the superintendent / supervising pharmacist chooses per role what may be done (draft entries, scan, open books, stock checks, patients & contacts, reminders, audit trail). Leads always have everything; signing entries is pharmacist-only; read-only can only view. Routes check named permissions with `requireStaff('<permission>')`; the UI uses `useCan()`.
- **Technician drafts:** someone who may not sign (e.g. a technician) saves entries as drafts (`entry_drafts`, `/api/entries/drafts`), with no effect on any balance. A pharmacist signs them from **To confirm** (posted through `/api/entries` with `draft_id`, so the balance, duplicate and late-entry rules apply) or turns them down with a reason; the line notes who drafted it.
- **Settings** is split into tabs: General, Security, Roles & permissions, Stock checks, Data & backups (and Document reading for the site owner). `?tab=` links straight to one.
- **Patients and doctors in entries:** on a methadone / buprenorphine book the patient box lists the OST patients on click; the doctor box lists doctors used before (saved automatically to Doctors & suppliers on every supply). Typing a new patient or doctor always works. Automatic patient creation (imports, Halo) reuses a certain match or the same name at the same address, and never adds a copy of someone already there.
- **Registers:** Form is a dropdown with "Other (type it)"; book covers clamp long names; **Close book** (balance 0) and **Close book opened in error** (only line is the opening balance: corrected to 0 and closed in one signed step). Scanned brands match a book whose brand contains them ("Rowex" → "Methadone Rowex").
- **Sidebar footer:** Lock / switch user, Training mode and Sign out in one compact row (icons with names on hover, aria-labels for tests). Sign out ends the pharmacy login on the device; Lock only locks the screen for the next person. The phone More menu keeps full-width buttons.
- **Require two-step sign-in** (Settings → Security). The last authenticator can't be removed while this is on, and a red banner shows if it goes missing.
- **Full backup:** Settings → Data → Full backup (JSON), supervising pharmacist only, audited. Printing is A4 landscape with page numbers and repeated headings.
- **Help** (`/dashboard/help`), a **Getting started** checklist on the registers page, public **/security**, **/privacy** and **/terms**, an app manifest (install to home screen), error pages with browser-error reporting, `/api/health`, and cookie-free Vercel Analytics.
- **Feedback & ideas** (`/dashboard/feedback`): ideas, problems or other messages, emailed to `ADMIN_NOTIFY_EMAIL`. The site owner sets a status, replies, and can share an idea under a neutral title on the **ideas board**, where pharmacies vote (one vote each).
- **Patient matching** (docs/PATIENT_MATCHING.md): scans and typed supplies are matched to existing patients despite spelling differences, with reasons shown; possible duplicates can be merged by a pharmacist.
- **Colour modes** (Settings → Display): Default (home-page mint), Light, True Black and HSE Dark, matching PharmacyConsultation.ie. Saved on the device and on the login (migration 0017). Public pages always stay mint.
- **Search:** drug dropdown by strength, and a patient report (all dispensings for a patient).
- **Audit trail, print and CSV export** for inspection.
- **Training mode:** a temporary copy of the pharmacy's register in the browser, under an orange bar. Nothing is saved, and it is cleared on refresh.
- **Demo mode:** `NEXT_PUBLIC_DEMO_MODE=1` builds a self-contained sample pharmacy. The home-page previews use it.
- **Pricing** (`src/config/pricing.ts`): €19/month launch price (normally €29) per premises; **groups: 25% off each additional pharmacy** (`GROUP`: €14 launch / €22, rounded), 10+ premises by agreement; groups joining during the launch keep launch prices. Shown on the pricing card and in the Terms.
- **Compliance claims:** every statement the site makes about security, data and AI is listed with its evidence in `docs/compliance/CLAIMS_EVIDENCE.md`. Update it when the system changes.

## 5. Site owner (ADMIN_EMAILS)

An account whose email is in `ADMIN_EMAILS`:
- Is always treated as complimentary.
- Sees the **Waitlist** and **Halo** settings.
- Sets the **site-wide OpenRouter key** in Settings → Document reader.

Other pharmacies never see API keys or model choices.

## 6. Testing

```bash
npx tsc --noEmit                       # types
npm run lint                           # lint (ESLint 9)
npx tsx scripts/test-invoice-rules.ts  # invoice quantity / reference rules
npx tsx scripts/test-register-page.ts  # paper-page opening-balance rules
npm run test:unit                      # reminders, late entries, stock effects, patient matching
npm run test:e2e                       # click-through of the demo build (needs it running on :3200)
npm run test:sweep                     # every page (desktop + phone) and every main workflow, demo build on :3200
npm run test:db                        # all migrations on a throwaway Postgres + register integrity rules
NEXT_PUBLIC_DEMO_MODE=1 npx next build && npx next start -p 3200   # click-through demo
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every push.

Not covered automatically: the real server API routes talking to a real Supabase project (sign-in, storage, Stripe, Vertex AI, email). The demo build exercises the same screens against an in-browser copy of the API. Check these on a Supabase **staging** project before major releases. Migrations were tested on a local Postgres 16, including the hash-chain backfill and a tamper test (a direct edit is detected at the exact line).

## 7. Outstanding / to do

- [ ] **Stripe (live set up 20 Nov 2026, account paused):** live account `acct_1UcnSO8GpcjkdgjQ` (its own account in the Pharmacy Consultation organisation). Live price `price_1Ucvnd8GpcjkdgjQNEs9oPJf` (€19/month, tax exclusive), webhook `we_1Udowe8GpcjkdgjQYYvEbSs0` (9 events), customer portal, restricted key "pharmacycdreg-live", statement descriptor `PHARMACYCDREG`, logo/icon and colours, receipt and refund emails on; Vercel Production holds the live values. Old keys "aiagent" and "ChatGBT" expired (21 Nov). **Blocking:** payments and payouts paused until the owner's identity check is resubmitted (Stripe → banner → View task; details must match the passport). Sign-up and the free month don't need Stripe. Then: live test (subscribe, webhook 200s, cancel/refund); Irish VAT registration in Stripe Tax when registered; group pricing (€14 price) and Invoicing for 10+ groups.
- [ ] **Google sign-in:** finish the Google Cloud client and Supabase provider set-up (docs/OPERATIONS.md §3).
- [x] **Migrations:** 0001–0024 are in production (0024 applied 17 Nov 2026). 0005 (`contacts`) had never been applied in production: found and applied 17 Nov 2026, backfilled from register history. Every table now verified present.
- [x] **Document reader:** Google Vertex AI live (service account with the *Vertex AI User* role, now shown as "Agent Platform User"; key uploaded in Settings → Document reading → EU multi-region; Test passes). The old OpenRouter key is still saved but unused while Vertex is set. File the sub-processor DPAs (`docs/compliance/SUBPROCESSOR_DPAS.md`).
- [x] **Company details:** name "PharmacyCDReg.ie" and email support@pharmacycdreg.ie set in `src/config/company.ts` (address still "Ireland"; set `NEXT_PUBLIC_COMPANY_ADDRESS` or edit it once there is a registered address). Have a solicitor review /privacy, /terms and `docs/compliance/DPA_TEMPLATE.md`.
- [ ] **Supabase plan:** Pro (daily backups, 7 days) and ideally Point-in-Time Recovery. Planned soon; the IPU pack already describes Pro daily backups, marked [enable before submission]. Leaked-password protection is on.
- [ ] **Vercel env:** set `SECRETS_KEY` (32+ random characters, different from `STAFF_SESSION_SECRET`) so stored API keys and staff sessions use separate keys. Then re-save the reader key in Settings so it's encrypted with the new key.
- [x] **Uptime monitor:** UptimeRobot "PharmacyCDReg health" on `https://pharmacycdreg.ie/api/health`, every 5 minutes, alerts to the owner's gmail (free plan allows one alert address). Set up 21 Nov 2026.
- [ ] **Restore drill:** once a year, restore a Full backup into a throwaway Supabase project with `scripts/restore-backup.mjs` and record the result (docs/BACKUP_AND_RESTORE.md).
- [x] **Code tidy-ups:** scripts are now nonce-based (`src/proxy.ts` + `src/lib/csp.ts`, `'strict-dynamic'`, no `'unsafe-inline'` for scripts; every page renders per request to carry its nonce). The `react-hooks/set-state-in-effect` cases were reviewed and annotated, and the rule is an error for new code.
- [ ] **Hardening checklist:** `docs/OPERATIONS.md` §6 (leaked-password protection, backups and restore test; uptime monitor done).
- [ ] **Multi-premises groups:** superintendent switching, the **Group overview** page and the group price (25% off each additional pharmacy) are built and shown. Still to do: charge it in Stripe (e.g. a second price for additional premises, or a coupon applied when a pharmacy joins a group that already pays for one).
- [ ] **Reminders:** consider an email or push notification for due reminders (they're in-app only for now).
- [ ] **Launch:** set `SIGNUPS_OPEN=1` and remove the `SIGNIN_UNLOCK_CODE` gate when ready. Then change the offer's `availability` in `src/lib/structured-data.ts` from `PreOrder` to `InStock`.
- [x] **Email (working, tested 20 Nov 2026):** test emails from welcome@ and support@ reached a Gmail inbox, SPF/DKIM/DMARC all pass. Google Workspace is on pharmacyconsultation.ie; pharmacycdreg.ie is an **alias domain** of its one user, support@pharmacyconsultation.ie, so welcome@ and support@pharmacycdreg.ie are aliases of that mailbox (added under Gmail "Send mail as"). Service account `cdreg-mailer` (project PharmacyCDreg) has domain-wide delegation for `gmail.send`; DKIM for pharmacycdreg.ie is on; SPF, DMARC and MX are in GoDaddy DNS. Vercel Production: `EMAIL_FROM` = welcome@pharmacycdreg.ie, `EMAIL_MAILBOX` = support@pharmacyconsultation.ie (must be the real user, not an alias), plus `EMAIL_FROM_NAME`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `ADMIN_NOTIFY_EMAIL`. Welcome and invitation emails are sent from welcome@pharmacycdreg.ie, all others from support@pharmacycdreg.ie. Settings → Email (site owner only) shows the set-up and sends a test from each. Optional: delete the spare cdreg-mailer key (two exist; Vercel uses one).
- [x] **Sign-in emails sent by us, not Supabase** (Supabase's built-in mailer only reaches the project's own team): Forgot password (`/api/auth/forgot`, from support@), new-pharmacy and superintendent invitations (from welcome@), and a "your password was changed" notice. Links go straight to `/reset-password?token_hash=…&type=recovery|invite` and are redeemed in the browser with `verifyOtp` (one use; reset 1 hour, invite 24 hours; email scanners don't use them up; removed from the address bar). Same answer whether or not the email has a login; limited to 3 requests per address and 10 per network per hour. New passwords: 10+ characters, not the email name or obvious ones; other devices are signed out after a change. Templates in `src/lib/auth-emails.ts`. Test: Forgot password on the sign-in page with your own login.
- [x] **Test pharmacy "Liffey Quay"**: deleted 17 Nov 2026 with its login (no entries, patients or scans; audit note `pharmacy.deleted`). Its Stripe sandbox customer and subscription are still in the sandbox: cancel them there if wanted.
- [x] **Search engines (21 Nov 2026):** Google Search Console (domain property verified via GoDaddy TXT; sitemap 9 pages; indexing requested for home, guides and info pages) and Bing Webmaster Tools (imported; sitemap submitted). Structured data: Organization, WebApplication, FAQ (data Q&A), Article/HowTo/Breadcrumb on guides, CollectionPage; no ratings or reviews. Share image `src/app/opengraph-image.tsx`. FAQ rich results aren't shown by Google for this kind of site (expected).
- [x] **Email keys:** only `cdreg-mailer` key cc17faa2 remains (the spare was deleted 21 Nov); run Settings → Email → test once to confirm sending still works.
- [ ] **Before launch: clear the test data.** The live pharmacy has been used for testing (including one real OST form). Wipe test registers, lines, drafts, scans and patients so real registers start with a clean audit trail. Hard deletes of test data are done at the owner's request while testing, each with an audit note; after launch use corrections / Close book opened in error instead.
- [ ] **IPU eCDR verification:** pack Draft 0.4 with evidence (22 Nov 2026), kept outside this public repo (it carries the signatory's name): test plan (36 requirements, 19 scenarios; PMR integration answered "Not applicable: standalone register"), evidence register (42 items), DOC-001/002/004, DEC-001, and 36 evidence files (25 screenshots, 5 videos, printed register, exports, audit trail, DB test report, configuration) captured from the demo build with Halo switched off and sample data only. Emailed to support@pharmacyconsultation.ie in 5 parts with a draft submission email. IPU contact: digitalpharmacy@ipu.ie (their directory invitation). Before submitting: ask the IPU how to submit and for the Requirements Specification; record VID-006 (live backup and restore); Supabase Pro, then remove the [enable before submission] notes; fill supplier details; sign test-plan section 8 and DEC-001. IPU Pharmacy Digital Solutions Directory: send both PharmacyCDReg.ie and PharmacyConsultation.ie – ConsultHub (text drafted; no endorsement wording on the site).
- [ ] **Google Vertex AI prompt logging:** exemption (zero data retention) requested via the Google Cloud Compliance & Data Privacy form on 16 Nov 2026; awaiting reply. When granted, the site can say no copy of a scan is kept anywhere (update CLAIMS_EVIDENCE D4, the home page Q&A and DEC-001).
- [ ] **Dependencies:** Stripe 23 done. Dependabot now skips major versions (`.github/dependabot.yml`); Tailwind 4, TypeScript 7 and @types/node 26 are planned upgrades for later. Playwright stays at the version that matches the preinstalled browser. PR #10 (tapentadol / Palexia reading, opened from the owner's account by Codex) is open and needs rebasing and review before merging.
- [ ] **Reader evaluation set:** build a set of anonymised Rx and invoice images with expected outputs, to measure accuracy before and after model changes.
- [ ] **Halo:** import Halo's CONTROLLED drug list to widen the catalogue (some brand and strength variants are missing; users can add them by hand meanwhile).
- [x] **Explainer advert (Nov 2026):** 1 min 50 s video, widescreen and 9:16 vertical, ElevenLabs "Darren" voiceover, owner's opening clip, the site's own animations re-recorded from the demo build, made-up names and wholesaler (Unopharma). Social cuts and source files are outside the repo (`pharmacycdreg-video` folder in the session); voiceover script in `docs/marketing/`. Website cut (no corner logo, no closing web address) is on the home page in `public/video/` via `src/components/advert-video.tsx`: tablets and computers autoplay muted when in view with "Tap for sound"; phones, reduce-motion and data-saver visitors tap to play.
- [x] **Advert opening clip:** replaced with the owner's new clip (worn, not burnt, books); the vertical cuts use a centre crop of it. All four versions re-cut, with Medvale Wholesale in the re-recorded register scenes.
- [x] **Made-up wholesalers:** demo data, home-page animations, the register image and form hints use Unopharma Wholesale and Medvale Wholesale (Unit 3, Fernhill Business Park, Dublin 24) instead of real wholesalers. Real names stay only in the invoice reader's rules.
- [x] **PSI wording:** checked Nov 2026 against the PSI segregation/destruction advice (via search results). Still worth reading the PSI disposal guidelines directly for the patient-return denaturing steps.

## 8. Known limitations

- Training mode needs a live sign-in to test end to end. The demo exercises the same mock layer.
- The catalogue (`cd-products.ts`) covers common Irish Schedule 2 products, not every presentation.
- Reading accuracy depends on photo quality. Handwritten quantities are always flagged for checking.
- The CD Destruction Record Book stores the drug as free text. It isn't linked to the catalogue, by design, because returns can be anything.
