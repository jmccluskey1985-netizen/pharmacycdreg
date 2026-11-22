# AGENTS.md: guide for AI coding assistants (ChatGPT / Codex, Claude, others)

PharmacyCDReg.ie is a live, legally significant system: the electronic **Controlled Drugs Register** for Irish community pharmacies (Misuse of Drugs Regulations 2017; built to the IPU eCDR conformance requirements). Treat it like medical-records software. Read this file, then [HANDOVER.md](HANDOVER.md) for the full picture.

## Stack

- **Next.js 16 (App Router)**, React 19, TypeScript, Tailwind 3, zod 4, ESLint 9. Node 22.
- **Supabase** (Postgres, EU / Paris): RLS on with **no policies**; the browser never touches the database. All access goes through server routes in `src/app/api/**` using the service role.
- **Vercel** (region `dub1`), with per-request nonce CSP in `src/proxy.ts`.
- **Google Vertex AI** (Gemini, EU) reads photos of prescriptions, invoices and reports (`src/lib/scan-extract.ts`, `src/lib/reader-config.ts`).
- **Stripe** Checkout, Customer Portal and webhook for billing (`src/lib/stripe.ts`, `src/app/api/billing/**`, `src/app/api/stripe/webhook`).

## Commands

```bash
npm ci
npx tsc --noEmit                 # types
npm run lint                     # must show 0 errors
npm run test:unit                # pure logic tests
npm run test:db                  # all migrations on a throwaway Postgres + integrity rules
NEXT_PUBLIC_DEMO_MODE=1 npx next build && npx next start -p 3200   # demo build (in-browser mock API)
npm run test:e2e                 # click-through of the demo build on :3200
npm run test:sweep               # every page (desktop + phone) and the main workflows, demo build on :3200
```

CI (`.github/workflows/ci.yml`) runs all of these on every push to `main`. Keep them green. New behaviour needs a test: a unit test for logic, and a sweep step for user flows. The demo mock (`src/lib/demo/mock.ts`) must support any new API route a sweep step uses.

## Rules you must not break

1. **The register is append-only.** `cd_entries` and `audit_log` reject UPDATE and DELETE by database trigger. A correction is a new row; the original stays visible. Balances come from the `cd_ledger` view and are never typed in or stored.
2. **Tamper evidence:** every register line and audit row is hash-chained (migration 0013). Never write to these tables in ways that bypass the triggers.
3. **Nothing is recorded automatically.** Scans, Halo dispensings, stock-report lines and technicians' drafts are proposals until a **pharmacist** signs them through `POST /api/entries`, which applies the balance, duplicate and late-entry rules.
4. **Brands are not interchangeable.** One register (book) per product and brand. `matchRegister` never posts into another brand's book.
5. **Permissions:** server routes call `requireStaff(<role check or named permission>)`. Named permissions (`src/lib/permissions.ts`) are configured per pharmacy; leads always have all of them, and only pharmacists sign entries. The UI uses `useCan()`, but the server is the real check.
6. **Patient data never leaves the EU, is never used for marketing, and is never sent to any AI provider except the configured EU reader.** If Vertex is configured and fails, scanning stops; it must not fall back to another provider.
7. **Every public claim must stay true.** `docs/compliance/CLAIMS_EVIDENCE.md` lists each statement on the site with its evidence. Update it, and the page, when behaviour changes.

## Repository hygiene (the repo is public)

- **No secrets** (keys, tokens, `.env` values), **no patient data**, and **no real names or personal emails** in code, tests, fixtures, docs or commit messages. Use obviously made-up people (e.g. "Declan Farrell, 12 Abbey Court, Ennis").
- Never use real prescription, label or report photos as fixtures. Use them only to understand a layout, then discard them.
- Secrets live in Vercel environment variables (marked Sensitive) or Supabase. See `docs/OPERATIONS.md` for the full list.

## Database changes

- Add a new numbered file in `supabase/migrations/` (next after the highest, e.g. `0025_*.sql`). Make it re-runnable (`if not exists`), enable RLS on new tables, and add no policies.
- It must pass `npm run test:db`. Apply it to production deliberately, then add it to the migration table in `docs/OPERATIONS.md` and the list in `HANDOVER.md`.
- Never edit an applied migration; write a new one.

## Where things are

```
src/app/page.tsx                 marketing home (demos, data Q&A band, pricing)
src/app/dashboard/**             the app (behind pharmacy login + staff PIN)
src/app/api/**                   server routes (every write via requireStaff(..., { write: true }))
src/lib/                         rules: entries, duplicates, late entries, OST, patient matching, report reconciliation, permissions, stripe, email
src/components/dashboard/**      entry form, register book, scanner folder, stock check, To confirm, settings panels
src/data/cd-products.ts          CD catalogue (brands, strengths, schedule paragraph)
src/lib/demo/mock.ts             demo / training mode: in-browser copy of the API
supabase/migrations/             0001–0026
tests/unit, tests/db, tests/e2e  tests (see Commands)
docs/                            operations, scanning, backup and restore, patient matching, compliance
```

## Style

- Plain, short UI text for pharmacists: say what happens, not how. Irish and UK spelling. Dates are dd/mm/yyyy.
- Keep changes small and focused, and match the patterns already in the file you're editing.
- Commit messages describe the change for a pharmacy owner as well as a developer.
