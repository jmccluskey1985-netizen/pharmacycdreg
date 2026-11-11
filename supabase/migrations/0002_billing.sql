-- Billing (Stripe) + self sign-up details for PharmacyCDReg
alter table pharmacies
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists billing_email text,
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_id text,
  add column if not exists subscription_status text,        -- trialing | active | past_due | canceled | unpaid …
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_reminder_key text;           -- e.g. "t_minus_3:2026-11-12" (de-dupes the daily cron)

create index if not exists pharmacies_subscription_id on pharmacies (subscription_id);
create index if not exists pharmacies_trialing on pharmacies (trial_ends_at) where subscription_status = 'trialing';
