-- 0019: invitation-only sign-up. While public sign-ups are closed (SIGNUPS_OPEN unset), an email
-- the site owner has approved can still create its own pharmacy account at /start, once.
-- Safe to re-run.
create table if not exists signup_invites (
  email text primary key,               -- lower case
  invited_at timestamptz not null default now(),
  invited_by text,
  used_at timestamptz,
  pharmacy_id uuid references pharmacies(id)
);
alter table signup_invites enable row level security; -- server only, no browser policies
