-- Waitlist (pre-launch). Written only by the server (service role); RLS on, no client policies.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  pharmacy_name text not null,
  email text not null,
  phone text,
  dispensing_system text,
  notes text,
  consent_contact boolean not null default false
);
create unique index if not exists waitlist_email_unique on waitlist (lower(email));
alter table waitlist enable row level security;
