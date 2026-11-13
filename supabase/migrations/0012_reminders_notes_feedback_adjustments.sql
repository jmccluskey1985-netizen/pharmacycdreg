-- 0012: dispensing reminders, notes (with scanned images), feedback / feature ideas,
-- and stock adjustments after a stock check.
-- Server-only access (RLS on, no policies), like every other table. Safe to re-run.

-- ───────────────────────── 1. Stock adjustment entry types ─────────────────────────
-- After a stock check that doesn't match, a pharmacist may bring the register balance into
-- line with the physical count. It is a NEW signed line in the register (never an edit), with
-- a mandatory explanation of the investigation. adjustment_in adds stock, adjustment_out removes it.
alter type cd_entry_type add value if not exists 'adjustment_in';
alter type cd_entry_type add value if not exists 'adjustment_out';

-- (::text comparisons so this works in the same transaction as ADD VALUE.)
alter table cd_entries drop constraint if exists adjustment_fields;
alter table cd_entries add constraint adjustment_fields check (
  entry_type::text not in ('adjustment_in', 'adjustment_out') or (quantity > 0 and length(coalesce(notes, '')) >= 10)
);

create or replace view cd_ledger as
with latest_correction as (
  select distinct on (corrects_entry_id) *
  from cd_entries
  where entry_type = 'correction'
  order by corrects_entry_id, seq desc
),
effective as (
  select
    o.id, o.register_id, o.seq, o.entry_type, o.recorded_at, o.recorded_by_staff_id, o.source,
    coalesce(c.transaction_date, o.transaction_date) as transaction_date,
    coalesce(c.quantity, o.quantity) as quantity,
    coalesce(c.supplier_name, o.supplier_name) as supplier_name,
    coalesce(c.supplier_address, o.supplier_address) as supplier_address,
    coalesce(c.recipient_name, o.recipient_name) as recipient_name,
    coalesce(c.recipient_address, o.recipient_address) as recipient_address,
    coalesce(c.prescriber_name, o.prescriber_name) as prescriber_name,
    coalesce(c.prescriber_address, o.prescriber_address) as prescriber_address,
    coalesce(c.authority_to_possess, o.authority_to_possess) as authority_to_possess,
    coalesce(c.prescription_ref, o.prescription_ref) as prescription_ref,
    coalesce(c.collected_by, o.collected_by) as collected_by,
    coalesce(c.collector_id_checked, o.collector_id_checked) as collector_id_checked,
    coalesce(c.witness_name, o.witness_name) as witness_name,
    coalesce(c.witness_role, o.witness_role) as witness_role,
    coalesce(c.destruction_method, o.destruction_method) as destruction_method,
    coalesce(c.notes, o.notes) as notes,
    c.id as correction_id,
    c.seq as correction_seq,
    c.correction_reason,
    c.recorded_at as corrected_at,
    c.recorded_by_staff_id as corrected_by_staff_id,
    (select count(*) from cd_entries x where x.corrects_entry_id = o.id) as correction_count
  from cd_entries o
  left join latest_correction c on c.corrects_entry_id = o.id
  where o.entry_type <> 'correction'
)
select e.*,
  case e.entry_type::text
    when 'receipt' then e.quantity
    when 'adjustment_in' then e.quantity
    when 'supply' then -e.quantity
    when 'destruction' then -e.quantity
    when 'adjustment_out' then -e.quantity
    else 0  -- patient returns are never pharmacy stock
  end as stock_effect,
  sum(case e.entry_type::text
        when 'receipt' then e.quantity
        when 'adjustment_in' then e.quantity
        when 'supply' then -e.quantity
        when 'destruction' then -e.quantity
        when 'adjustment_out' then -e.quantity
        else 0 end)
    over (partition by e.register_id order by e.seq rows between unbounded preceding and current row) as running_balance
from effective e;

-- ───────────────────────── 2. Dispensing reminders ─────────────────────────
-- e.g. a weekly methadone / OxyNorm supply. When due, one click records every line (each
-- signed by the pharmacist, through the normal entry checks), then the reminder moves on.
create table if not exists dispense_reminders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'fortnightly', 'four_weekly', 'monthly', 'custom')),
  interval_days int check (interval_days between 1 and 366),
  next_due date not null,
  lines jsonb not null default '[]'::jsonb,   -- [{register_id, quantity, recipient_name, recipient_address, prescriber_name, prescriber_address, authority_to_possess, patient_id}]
  notes text,
  active boolean not null default true,
  created_by_staff_id uuid references staff(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  last_done_on date,
  last_done_by_name text,
  updated_at timestamptz not null default now()
);
create index if not exists dispense_reminders_due on dispense_reminders (pharmacy_id, next_due) where active;
alter table dispense_reminders enable row level security;

-- ───────────────────────── 3. Notes (with scanned images) ─────────────────────────
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  title text not null,
  body text not null default '',
  category text,                       -- free text, e.g. "Stock discrepancy", "SOP", "Inspection"
  pinned boolean not null default false,
  register_id uuid references cd_registers(id) on delete set null,
  stock_check_id uuid references stock_checks(id) on delete set null,
  entry_id uuid references cd_entries(id) on delete set null,
  archived boolean not null default false,
  created_by_staff_id uuid references staff(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz not null default now()
);
create index if not exists notes_pharmacy on notes (pharmacy_id, pinned desc, updated_at desc);
create index if not exists notes_register on notes (register_id);
alter table notes enable row level security;

create table if not exists note_attachments (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  note_id uuid not null references notes(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists note_attachments_note on note_attachments (note_id);
alter table note_attachments enable row level security;

-- Private storage bucket for the images (served only through the app, never public).
insert into storage.buckets (id, name, public) values ('cd-notes', 'cd-notes', false) on conflict (id) do nothing;

-- ───────────────────────── 4. Feedback & feature ideas ─────────────────────────
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid references pharmacies(id) on delete set null,
  pharmacy_name text,
  staff_name text,
  kind text not null check (kind in ('idea', 'problem', 'other')),
  message text not null check (length(message) between 3 and 4000),
  page text,
  status text not null default 'new' check (status in ('new', 'read', 'planned', 'in_progress', 'done', 'declined')),
  reply text,
  shared boolean not null default false,  -- site owner shares an idea (wording tidied) for everyone to vote on
  shared_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_recent on feedback (created_at desc);
alter table feedback enable row level security;

create table if not exists feedback_votes (
  feedback_id uuid not null references feedback(id) on delete cascade,
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (feedback_id, pharmacy_id)
);
alter table feedback_votes enable row level security;
