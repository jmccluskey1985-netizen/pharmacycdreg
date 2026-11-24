-- Phone notifications (Web Push) for dispensing reminders due. One row per device that turned
-- them on. Notifications carry counts only, never patient details. Server-only (RLS on, no policies).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures int not null default 0
);
create index if not exists push_subscriptions_pharmacy on push_subscriptions (pharmacy_id);
alter table push_subscriptions enable row level security;

-- The site's own push keys (VAPID), made once by the app; the private key is encrypted like the reader key.
alter table site_secrets add column if not exists vapid_public text;
alter table site_secrets add column if not exists vapid_private_enc text;
