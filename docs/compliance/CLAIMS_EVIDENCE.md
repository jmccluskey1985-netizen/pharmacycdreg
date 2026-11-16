# Claims and evidence register

Every statement the public site makes about the register, security, data protection and AI, with
where it appears, what backs it up, and its status. For a solicitor's review, the IPU evidence pack,
or a superintendent who asks "how do you know?".

**Keep it true:** when the system changes, update this list and the pages it names. Re-check before
each IPU submission. Status: ✅ verified in code / config · 🟡 true, but an owner action would make it stronger · 🔴 don't claim yet.

Pages: **Home** (`src/app/page.tsx`: hero ticks, trust strip, "Your data, security and AI, answered"),
**Data safety** (`/data-safety`), **Security** (`/security`), **Privacy** (`/privacy`).

## Register and record keeping

| # | Claim (where) | Evidence | Status |
|---|---|---|---|
| R1 | Running balances calculated for you (Home ticks) | `cd_ledger` view computes `running_balance` per line (migrations 0001, 0013); unit and e2e tests | ✅ |
| R2 | Duplicate and error checks on every entry (Home ticks) | `src/lib/duplicates.ts` (invoice / Rx reuse, same-day guard); `api/entries` refuses a balance below zero; mandatory fields enforced by database CHECK constraints (`entry-schema.ts`, migration 0001) | ✅ |
| R3 | Lines can't be edited or deleted, by anyone; corrections are new lines beside the original (Home card "Never", Data safety) | Database triggers block UPDATE / DELETE on `cd_entries` (migration 0001); corrections are `entry_type = 'correction'` rows; DB tests in `tests/db` | ✅ |
| R4 | Tamper-evident: every line sealed with a fingerprint chained to the one before; Verify integrity in one click (Home ticks + card, Data safety) | SHA-256 hash chain on register and audit trail (migration 0013); Audit trail → Verify integrity; verified on production registers | ✅ |
| R5 | Full audit trail of who did what and when (Data safety, Security) | `audit_log` written by database trigger (can't be skipped by the app); hash-chained (0013) | ✅ |
| R6 | Late entries carry a footnote with the reason (Data safety, stock check) | `api/entries` requires `late_reason` for transactions older than a day and writes "Late entry: …" into the line (`src/lib/late-entry.ts`) | ✅ |
| R7 | Read-only, time-limited links for inspectors; every view logged (Home ticks, Data safety) | `/inspect/[token]`, expiry on the link, view audit events | ✅ |
| R8 | Laid out like the paper register, printable, CSV export (Data safety) | Register page and print view; CSV export per register and all registers | ✅ |
| R9 | Built around the IPU eCDR requirements (Home hero) | Conformance Test Plan and Evidence Register completed (FR / NFR mapping); DEC-001 declaration | ✅ Wording only: **don't** say "IPU verified" or use the IPU logo until verification is granted |
| R10 | Works on phone, tablet and PC (Home ticks) | Responsive layout; automated phone-width checks in `tests/e2e/sweep.mjs` | ✅ |

## Access and security

| # | Claim (where) | Evidence | Status |
|---|---|---|---|
| S1 | Encrypted in transit (Home card "Encrypted", Data safety) | HTTPS only, HSTS `max-age=63072000; includeSubDomains; preload` (`next.config.js`); strict per-request CSP (`src/proxy.ts`) | ✅ |
| S2 | Encrypted at rest (Home card, Data safety) | Database provider (Supabase) encrypts storage at rest (AES-256) | ✅ Provider-level; keep their security page in the compliance folder |
| S3 | Only your pharmacy can see it; browsers can't reach the database directly (Data safety) | Row Level Security on with no public policies; all access through server routes with the service role, scoped by pharmacy id; security advisor checks | ✅ |
| S4 | Two locks: pharmacy login (two-step available) and each person's own PIN (Home card, Data safety) | Supabase Auth + optional TOTP two-step (`two-step.tsx`, require-2FA setting); staff PIN lock with database rate limit | ✅ |
| S5 | Roles limit what people can do; technicians draft, pharmacists sign (Home card, Data safety) | `src/lib/roles.ts`; sweep test "technician can draft but not sign" | ✅ |
| S6 | Screens lock when left idle (Home card, Data safety) | Idle lock in the staff context | ✅ |
| S7 | Superintendents across pharmacies still sign with each pharmacy's PIN; data stays separate (Data safety) | Group access + per-pharmacy PIN; every query scoped by pharmacy id | ✅ |

## Data protection and AI

| # | Claim (where) | Evidence | Status |
|---|---|---|---|
| D1 | Data processing agreement with the AI provider (Home strip + card "Yes") | Google Cloud Data Processing Addendum, incorporated in the Google Cloud terms for the account | 🟡 Owner: add a privacy contact in Google Cloud and save a dated PDF of the CDPA (see SUBPROCESSOR_DPAS.md) |
| D2 | Not used to train AI (Home strip + card "No", Data safety, Privacy) | Google Cloud Vertex AI data governance terms: customer data isn't used to train models | ✅ |
| D3 | Processed in the EU (Home strip + card "EU", Data safety) | Database: Supabase project in eu-west-3 (Paris). App servers: Vercel region `dub1` (`vercel.json`). AI: Vertex AI EU location (reader settings) | ✅ |
| D4 | Photos aren't stored, only the details read from them (Home card "No", Data safety) | Scan routes read files in memory and store only the extracted details (`scans` table); no file storage upload in `api/scan*` or `api/stock-checks/reconcile` | ✅ Wording is about **our** system. 🟡 Owner: turn off Google's abuse-monitoring logging for Vertex AI so it's also true at Google; then the site can say "no copy is kept anywhere" |
| D5 | The AI can't change the register; nothing is recorded until a pharmacist checks it and signs with their PIN (Home card "No", Data safety) | Scan / report routes return proposals only; every write goes through `api/entries` with a PIN-unlocked staff session and `can.record` | ✅ |
| D6 | Patient data never used for marketing (Home card "Never", Data safety, Privacy) | Privacy: "never use it for any purpose of our own, never use it for marketing, never sell it and never use it to train AI"; no marketing tooling in the system | ✅ |
| D7 | Your pharmacy gets its own data processing agreement (Home band, Data safety) | `docs/compliance/DPA_TEMPLATE.md`, available on request | 🟡 Owner: have a solicitor review the DPA once, then offer it as a signable PDF |
| D8 | Published list of every company that processes data (Data safety, Privacy) | `src/config/company.ts` `SUBPROCESSORS`, shown on both pages | ✅ |
| D9 | GDPR roles: pharmacy is controller, we're processor; health data (Art. 9) basis stated (Privacy) | Privacy page; DPIA (`docs/compliance/DPIA.md`) | ✅ |

## Backups and continuity

| # | Claim (where) | Evidence | Status |
|---|---|---|---|
| B1 | Download a password-protected full backup any time (Home card "Yes", Data safety) | Settings → Data; encrypted in the browser, password never leaves it (`backup-button.tsx`, `api/backup`) | ✅ |
| B2 | A restore tool rebuilds a pharmacy from the backup and proves every line matches (Home card, Data safety) | Restore loader with hash-chain verification (`docs/BACKUP_AND_RESTORE.md`) | ✅ |
| B3 | A weekly email records each register's latest fingerprint outside the system (Home card, Data safety) | `api/cron/daily-digest` sends the "Weekly integrity record" on Mondays (`vercel.json` cron) | ✅ |
| B4 | Export everything; if you stop paying, the register stays readable and exportable (Data safety, Pricing) | Read-only mode when unsubscribed; CSV and full backup remain available | ✅ |
| B5 | (Not claimed yet) Automatic daily database backups / point-in-time recovery | Needs the database provider's paid plan | 🔴 Owner: upgrade to Supabase Pro, then this can be added to the Backups card |

## Things to check before launch (legal)

1. Confirm the Misuse of Drugs Regulations amendment allowing electronic CD registers is **in force**, not only proposed, before pharmacies stop keeping the paper book (IPU or Department of Health).
2. A solicitor experienced in health data reviews: Terms, Privacy page, and the pharmacy DPA. One-off.
3. All advertising claims must be true (Consumer Protection Act 2007, misleading commercial practices): this register is the check.
