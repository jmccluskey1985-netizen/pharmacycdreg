-- "Doctors & suppliers": a pharmacy's own quick-fill list (regular GMS doctors,
-- wholesalers, usual witnesses). Not register data, so it can be edited; changes
-- never alter past register entries. Server-only access (RLS on, no policies).
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  kind text not null check (kind in ('prescriber', 'supplier', 'witness')),
  name text not null,
  address text,
  registration text,     -- prescriber: Medical Council (IMC) number
  gms_number text,       -- prescriber: GMS doctor number
  role text,             -- witness: capacity, e.g. Authorised officer
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_lookup on contacts (pharmacy_id, kind, lower(name)) where is_active;
alter table contacts enable row level security;
