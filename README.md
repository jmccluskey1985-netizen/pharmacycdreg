# PharmacyCDReg.ie

Electronic Controlled Drug Register for Irish community pharmacies. It is a sister product to PharmacyConsultation.ie, uses the same logo style and login pattern, and has its own domain, repo and database.

## What it does

| Area | How |
|---|---|
| **Sign in** | Pharmacy email + password on the landing page (Supabase Auth), then each person enters their **staff PIN** (4–6 digits, bcrypt-hashed, 5 tries/min). The PIN sets an httpOnly signed cookie. Every entry is signed by that staff member's name and PSI number. Auto-locks after 15 min idle. |
| **Registers** | One "book" per drug/strength/form, grouped by schedule and class. Pages use the same columns as the PSI paper register: date, name & address, authority to possess, amount obtained/supplied, stock balance, pharmacist, plus footnotes and continued-from/on page. Opening a register plays a book-opening animation. |
| **Entries** | Receipt, supply, witnessed destruction, patient return (kept out of stock) and patient-return destruction. The running balance is calculated and never typed. Entries that would take stock below zero are refused. |
| **Corrections** | Never overwrite. A correction is a new row; the original stays visible, struck through, with a footnote giving who, when, what changed and why. Balances recalculate. |
| **Scan invoices** | Phone camera viewfinder (multi-page) or upload. Claude reads the wholesaler invoice, picks out CD lines and converts packs to units, then matches each line to a register. A pharmacist checks and confirms every line; nothing is recorded automatically. Prescriptions are also supported. |
| **Inspection** | Search by drug, date, supplier, patient, prescriber or authority, sorted either way. Print or CSV export per register. Witnessed Destruction Record page. |
| **Audit** | Every entry, sign-in, failed PIN, view, export, scan and staff change goes into an append-only `audit_log`. |
| **Roles** | Supervising pharmacist, pharmacist, locum pharmacist (with optional access end date), technician (can scan/draft only) and read-only. |

## Enforced in the database, not just the UI

`supabase/migrations/0001_cd_register.sql`:
- `cd_entries`, `audit_log` and `scans` reject UPDATE and DELETE via triggers (FR10, NFR4).
- CHECK constraints require the statutory fields per entry type: supplier for receipts, recipient for supplies, witness for destructions (FR5, FR19).
- A unique index allows only one live register per product per premises (FR13).
- The `cd_ledger` view derives the effective values and running balance from the immutable rows (FR3, FR12, FR20).
- The audit row is written by trigger on every entry.
- RLS is enabled with no client policies. All access goes through server routes that check the login, then the PIN session.

## IPU eCDR conformance map

| Ref | Where |
|---|---|
| FR1, FR4, FR6, FR8 | Register per product, grouped by class; heading shows class and product |
| FR2a/b, FR5, FR9 | `EntrySchema` + DB CHECKs; `seq` per register; transaction date + recorded_at |
| FR3, FR12, FR20 | `cd_ledger` running balance |
| FR10, FR11, NFR4, NFR5 | Append-only triggers; correction rows; footnotes; audit log |
| FR13, FR14 | Unique live register; registers belong to a premises |
| FR15, FR16, NFR10–14 | Register book view, print, CSV, search |
| FR18, FR19 | Destruction entries with witness name and capacity |
| NFR1–3 | Staff roles + PIN + `can.*` checks on every route |
| NFR6–9, 15, 16 | Supabase (EU region) backups/PITR; no delete path in app. Document retention and backup arrangements in your Evidence Pack (DOC-002, DEC-001). |

## Setup

1. Create a Supabase project in an EU region and run `supabase/migrations/0001_cd_register.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill it in. Generate `STAFF_SESSION_SECRET` with `openssl rand -hex 32`.
3. `npm install && npm run dev`
4. Create a pharmacy and its login:
   ```bash
   node --env-file=.env.local scripts/create-pharmacy.mjs --name "…" --address "…" --email … --password …
   ```
5. Sign in on the landing page. The first screen asks for the supervising pharmacist's name, PSI number and PIN. They add the rest of the team under **Team**.
6. Open a register for each CD product and enter the balance brought forward from the paper book.

Deploy on Vercel as its own project with the same environment variables, and point the pharmacycdreg.ie domain at it.
