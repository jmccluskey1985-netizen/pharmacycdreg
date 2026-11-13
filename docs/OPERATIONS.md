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
