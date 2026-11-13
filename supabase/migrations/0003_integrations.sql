-- PMR integration (e.g. Halo): dispensing system pushes CD supplies to PharmacyCDReg.
-- Incoming dispensings land in an inbox ("To confirm") unless the key is set to
-- auto-post AND the dispensing pharmacist is matched to a staff member by PSI number.

create table if not exists integration_keys (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  name text not null,                         -- e.g. "Halo – dispensary PC"
  key_prefix text not null,                   -- first 8 chars, shown in UI to identify the key
  key_hash text not null unique,              -- sha256 of the full key; the key itself is shown once
  auto_post boolean not null default false,
  created_by_staff_id uuid references staff(id),
  created_by_auth_user uuid not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists pmr_inbox (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  integration_key_id uuid references integration_keys(id),
  source text not null default 'halo',
  external_id text not null,                  -- Halo's unique id for the dispensed item (idempotency)
  action text not null default 'dispense' check (action in ('dispense', 'reverse')),
  payload jsonb not null,
  register_id uuid references cd_registers(id),
  status text not null default 'pending' check (status in ('pending', 'posted', 'rejected')),
  problem text,                               -- why it couldn't auto-post (no register match, unknown pharmacist, balance…)
  entry_id uuid references cd_entries(id),
  resolved_by_staff_id uuid references staff(id),
  resolved_at timestamptz,
  received_at timestamptz not null default now(),
  unique (pharmacy_id, source, external_id, action)
);
create index if not exists pmr_inbox_pending on pmr_inbox (pharmacy_id, received_at desc) where status = 'pending';

alter table integration_keys enable row level security;
alter table pmr_inbox enable row level security;
