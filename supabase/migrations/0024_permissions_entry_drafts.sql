-- 0024: configurable role permissions and technician-drafted register entries.
-- - pharmacies.permissions: the superintendent / supervising pharmacist's choices of what each role
--   may do ({ "technician": { "draftEntries": true, ... }, ... }); missing keys use the defaults in
--   src/lib/permissions.ts. Leads always keep everything; signing entries stays pharmacist-only.
-- - entry_drafts: a register line prepared by someone who may not sign (e.g. a technician). It has
--   no effect on any balance. A pharmacist checks it in "To confirm" and signs it, which posts a
--   normal signed entry through /api/entries (balance, duplicate and late-entry rules apply).
-- Safe to re-run.
alter table pharmacies add column if not exists permissions jsonb not null default '{}'::jsonb;

create table if not exists entry_drafts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  register_id uuid not null references cd_registers(id),
  payload jsonb not null,
  drafted_by_staff_id uuid references staff(id),
  drafted_by_name text,
  drafted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'signed', 'rejected')),
  entry_id uuid references cd_entries(id),
  resolved_by_staff_id uuid references staff(id),
  resolved_at timestamptz,
  reject_reason text
);
create index if not exists entry_drafts_pending on entry_drafts (pharmacy_id, drafted_at) where status = 'pending';
alter table entry_drafts enable row level security;
