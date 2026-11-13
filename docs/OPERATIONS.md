# Operations: environment, database, sign-in providers, deployment

> No secret values belong in this repo (it is public). Values live only in Vercel → Project → Settings → Environment Variables, or in Supabase.

## 1. Environment variables (Vercel)

| Variable | Needed | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. `next.config.js` also accepts `SUPABASE_URL` and detects URL vs key by its shape, with the project URL as a default. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `…_ANON_KEY` | yes | Browser key |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | yes | Server key. All data access goes through server routes. |
| `STAFF_SESSION_SECRET` | yes | Signs the staff-PIN cookie (`openssl rand -hex 32`) |
| `SECRETS_KEY` | recommended | Encrypts the site-wide reader key (falls back to `STAFF_SESSION_SECRET`). **Changing it means re-entering the OpenRouter key.** |
| `ADMIN_EMAILS` | yes | Comma-separated site-owner emails. They get the waitlist, the document-reader key setting and Halo settings, and their pharmacy is always treated as complimentary. |
| `CANONICAL_HOST` | optional | Default `pharmacycdreg.ie`; www and production `*.vercel.app` redirect here |
| `NEXT_PUBLIC_SITE_URL` | yes | e.g. `https://pharmacycdreg.ie`, used in emails and redirects |
| `SIGNIN_UNLOCK_CODE` | while pre-launch | Code behind "Pharmacy access" on the home page |
| `SIGNUPS_OPEN` | at launch | `1` opens self sign-up at `/start` |
| `OPENROUTER_API_KEY` | optional | Fallback reader key (normally set in Settings instead) |
| `ANTHROPIC_API_KEY` | optional | Legacy reader fallback |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | for billing | See README → Stripe setup |
| `CRON_SECRET` | for billing | Protects `/api/cron/trial-reminders` (`vercel.json`, daily 09:17 UTC) |
| `EMAIL_FROM`, `EMAIL_FROM_NAME`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | for email | Waitlist and trial-reminder email (`src/lib/email.ts`) |
| `ADMIN_NOTIFY_EMAIL` | optional | Who receives waitlist notifications |
| `NEXT_PUBLIC_COMPANY_NAME`, `NEXT_PUBLIC_COMPANY_ADDRESS`, `NEXT_PUBLIC_CONTACT_EMAIL` | before launch | Shown on /privacy, /terms and /security (public, not secrets) |
| `NEXT_PUBLIC_DEMO_MODE` | never in production | `1` builds the click-through demo (in-browser fake data) |

## 2. Database migrations (Supabase → SQL editor)

Run them in order. Each one is safe to re-run (`if not exists`).

| File | Adds |
|---|---|
| 0001_cd_register | Pharmacies, staff, products, registers, append-only `cd_entries`, `cd_ledger` view, `audit_log`, scans |
| 0002_billing | Subscription fields |
| 0003_integrations | Halo / PMR inbox (`To confirm`) |
| 0004_waitlist | Waitlist |
| 0005_contacts | Remembered prescribers, suppliers and witnesses |
| 0006_halo_flag | `halo_enabled` per pharmacy |
| 0007_settings_stock_checks | Pharmacy settings, low-stock level, `stock_checks` |
| 0008_patients | `patients`, `cd_entries.patient_id` |
| 0009_reader_settings | `site_secrets` (encrypted site-wide reader key) |
| 0010_product_brand | `cd_products.brand` (one register per brand) |
| 0011_quarantine_destruction_book | `quarantine_items`, `destruction_book` |
| 0014_vertex_reader | `site_secrets` columns for Google Vertex AI (`reader_provider`, encrypted service-account key, project, location) |
| 0013_integrity_inspector_2fa | SHA-256 hash chain on `cd_entries` and `audit_log` (backfills existing rows), `verify_register_chain()` / `verify_audit_chain()`, `inspector_links`, `pharmacies.require_2fa` |
| 0012_reminders_notes_feedback_adjustments | `dispense_reminders`, `notes` + `note_attachments` (private storage bucket `cd-notes`), `feedback` + `feedback_votes`, entry types `adjustment_in` / `adjustment_out` and the updated `cd_ledger` view |

Pages whose table isn't there yet say "Needs a one-off database update: run migration 00xx" rather than failing.

Useful one-off SQL:

```sql
-- Permanent free account (no Stripe)
update pharmacies set subscription_status = 'complimentary' where billing_email = '<email>';
```

**Never delete real register entries.** `cd_entries` and `audit_log` block UPDATE and DELETE by trigger. Clean up test data only by temporarily disabling the trigger, and only for test rows.

## 3. Sign-in

- **Accounts:** pharmacy email + password (Supabase Auth). The browser session is persisted, and the middleware refreshes it and copies refreshed cookies onto redirects.
- **Staff PIN:** after sign-in, each person enters a PIN (httpOnly signed cookie; auto-lock after 15 min idle). A wrong PIN shows an error and never signs the account out.
- **2FA (optional):** TOTP authenticator, under Settings → Security (Supabase MFA). When it is on, the middleware and `requireAccount` require `aal2`.
- **Google sign-in:**
  1. Google Cloud → OAuth client (Web). Set the authorised redirect URI to `https://<project>.supabase.co/auth/v1/callback`.
  2. Supabase → Authentication → Providers → Google: paste the client ID and secret.
  3. Supabase → Authentication → URL configuration:
     - Site URL: `https://pharmacycdreg.ie`
     - Redirect URLs: add `https://pharmacycdreg.ie/auth/callback`
  4. A Google account only gets in if its email already belongs to a pharmacy. Otherwise it is signed out with a message (`/auth/callback`).

## 4. Billing states

`effectiveStatus()` in `src/lib/stripe.ts`:

| Status | Meaning |
|---|---|
| `trialing` | Free month, **no card needed**. It starts at sign-up and a countdown banner offers Subscribe. |
| `trial_ended` | `trialing` with no Stripe subscription and the trial date passed. The account is **read-only**. |
| `active` / `past_due` | Stripe-managed |
| `complimentary` | Permanent, no Stripe. Site owners are always treated as this. |

Subscribing during the trial keeps the remaining free days (Checkout `trial_end`).

## 5. Deploy

- **Vercel project:** `pharmacycdreg`, connected to GitHub `main`. A push deploys.
- **Checking a deploy:** check the commit status on GitHub, because the vercel.app URL redirects to the canonical host.
- **Demo build:**
  ```bash
  NEXT_PUBLIC_DEMO_MODE=1 npx next build && npx next start -p 3200
  ```
  The demo PINs are listed on the PIN screen.

## 6. Hardening checklist (one-off, in dashboards)

- **Vercel:**
  - Region is pinned to Dublin by `vercel.json` (`"regions": ["dub1"]`).
  - Turn on **Web Analytics**. It's cookie-free, and the `<Analytics />` component is already in place.
- **Uptime:** point a monitor (e.g. UptimeRobot or Better Stack, free tier) at `https://pharmacycdreg.ie/api/health`. It returns 200 when the app and the database answer.
- **Errors:** browser errors are logged as `[client-error]` lines. Find them in Vercel → Logs, and add a log alert or drain if you want email.
- **Supabase:**
  - **Authentication → Providers → Email:** turn on *Leaked password protection* and set the minimum password length to 10.
  - **Authentication → Rate limits:** keep the defaults or lower them.
  - **Database → Backups:** confirm daily backups. Add Point-in-Time Recovery when you have paying customers.
  - Run the restore test in `docs/BACKUP_AND_RESTORE.md` and keep the record.
- **GitHub:** `.github/workflows/ci.yml` runs on every push to `main`: type check, lint, unit and rule tests, a demo build, and the click-through test (`tests/e2e/demo.mjs`).
- **Security headers:** set for every route in `next.config.js`: HSTS, CSP, frame-ancestors none, nosniff, referrer policy, permissions policy and COOP. API responses are `private, no-store`.
- **Cron jobs:** `vercel.json` runs `trial-reminders` (09:17 UTC) and `daily-digest` (06:43 UTC). `daily-digest` sends due-reminder counts each morning and the weekly integrity fingerprints on Mondays. Both need `CRON_SECRET`.
