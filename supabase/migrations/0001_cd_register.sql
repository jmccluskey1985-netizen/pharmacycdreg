-- PharmacyCDReg.ie — Electronic Controlled Drug Register schema
-- Maps to the IPU eCDR Conformance Test Plan (FR1–FR20, NFR1–NFR16).
-- Design rules:
--   * Register entries are APPEND-ONLY. UPDATE/DELETE are blocked by trigger (FR10, NFR4).
--   * A correction is a NEW row pointing at the original (FR11, NFR5). The original is
--     never altered; the ledger view shows both and uses the corrected values (FR12).
--   * Running balance is derived from the immutable rows (FR3, FR20), never typed in.
--   * Every write lands in an append-only audit_log by trigger (NFR5).
--   * All browser access goes through API routes using the service role; RLS is on with
--     no anon/authenticated policies, so the database is closed to direct client access.

create extension if not exists pgcrypto;

-- ───────────────────────── Pharmacies & accounts ─────────────────────────
create table pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  psi_premises_number text,              -- FR14: registers attributable to premises
  address text not null,
  created_at timestamptz not null default now()
);

-- Supabase auth user ↔ pharmacy (the shared pharmacy login, as on PharmacyConsultation.ie)
create table pharmacy_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Staff who sign in with a PIN on top of the pharmacy login (NFR1–NFR3)
create type staff_role as enum ('supervising_pharmacist', 'pharmacist', 'locum_pharmacist', 'technician', 'read_only');

create table staff (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  full_name text not null,
  role staff_role not null,
  psi_number text,
  pin_hash text,                         -- bcrypt, never plaintext
  is_active boolean not null default true,
  access_expires_at timestamptz,         -- temporary / locum access (scenario: locum workflow)
  created_at timestamptz not null default now()
);
create index on staff (pharmacy_id) where is_active;

-- ───────────────────────── Drugs & registers ─────────────────────────
create table cd_products (
  id uuid primary key default gen_random_uuid(),
  drug_name text not null,               -- e.g. Morphine sulfate (FR8 heading)
  schedule smallint not null check (schedule between 2 and 4),
  schedule_paragraph text,               -- Sch.2 para 1/3/6 grouping (FR6)
  class_name text not null,              -- class of drug: one register part per class (FR4)
  is_stereoisomer_of uuid references cd_products(id), -- FR7: recorded under parent register
  form text not null,                    -- tablet, oral solution, ampoule…
  strength text not null,
  unit text not null default 'unit',     -- tablets, ml, ampoules
  created_at timestamptz not null default now()
);

create table cd_registers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete restrict,
  product_id uuid not null references cd_products(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opened_by_staff_id uuid not null references staff(id),
  closed_at timestamptz,
  closed_by_staff_id uuid references staff(id)
);
-- FR13: one live register per drug per premises
create unique index cd_registers_one_live on cd_registers (pharmacy_id, product_id) where closed_at is null;

-- ───────────────────────── Entries (append-only) ─────────────────────────
create type cd_entry_type as enum (
  'receipt',                  -- FR2a
  'supply',                   -- FR2b
  'destruction',              -- FR18/19 pharmacy stock
  'patient_return',           -- returned by patient, logged (does not change stock)
  'patient_return_destruction',
  'correction'                -- FR11: amends an earlier row, never overwrites it
);

create table cd_entries (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references cd_registers(id) on delete restrict,
  seq bigint not null,                   -- per-register chronological sequence (FR9)
  entry_type cd_entry_type not null,
  transaction_date date not null,        -- date of receipt/supply/destruction
  recorded_at timestamptz not null default now(),

  -- Signed effect on stock: +receipt, −supply/destruction. 0 for patient_return.
  quantity numeric(12,3) not null check (quantity >= 0),

  -- Receipt (Misuse of Drugs Regs, Sch.2 register part 1)
  supplier_name text,
  supplier_address text,

  -- Supply (part 2)
  recipient_name text,
  recipient_address text,
  prescriber_name text,
  prescriber_address text,
  authority_to_possess text,             -- licence/authority of person supplied (FR5, NFR14)
  prescription_ref text,
  collected_by text,
  collector_id_checked boolean,

  -- Destruction (FR19)
  witness_name text,
  witness_role text,
  destruction_method text,

  -- Correction (FR11/NFR5)
  corrects_entry_id uuid references cd_entries(id),
  correction_reason text,

  notes text,
  source text not null default 'manual' check (source in ('manual', 'pmr', 'scan')),
  scan_id uuid,                          -- set when drafted from a scanned Rx / invoice
  recorded_by_staff_id uuid not null references staff(id),
  recorded_by_auth_user uuid not null,

  unique (register_id, seq),

  constraint receipt_fields check (entry_type <> 'receipt' or (supplier_name is not null and supplier_address is not null and quantity > 0)),
  constraint supply_fields check (entry_type <> 'supply' or (recipient_name is not null and recipient_address is not null and quantity > 0)),
  constraint destruction_fields check (entry_type not in ('destruction', 'patient_return_destruction') or (witness_name is not null and witness_role is not null and quantity > 0)),
  constraint correction_fields check ((entry_type = 'correction') = (corrects_entry_id is not null) and (entry_type <> 'correction' or length(coalesce(correction_reason, '')) >= 5))
);
create index on cd_entries (register_id, seq);
create index on cd_entries (corrects_entry_id);
create index on cd_entries (transaction_date);

-- FR10 / NFR4: no silent overwrite or deletion — ever.
create or replace function block_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op;
end $$;
-- Scanned prescriptions / invoices. Extraction only ever produces DRAFTS; nothing
-- reaches the register until a PIN-identified pharmacist confirms each line.
create table scans (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete restrict,
  document_type text not null check (document_type in ('prescription', 'invoice', 'other')),
  extracted jsonb not null,
  model text not null,
  scanned_by_staff_id uuid not null references staff(id),
  created_at timestamptz not null default now()
);
alter table cd_entries add constraint cd_entries_scan_fk foreign key (scan_id) references scans(id);
create trigger scans_no_update before update or delete on scans for each row execute function block_mutation();

-- Assign seq, check register is open, block corrections of corrections / cross-register.
create or replace function cd_entries_before_insert() returns trigger language plpgsql as $$
declare
  reg cd_registers%rowtype;
  orig cd_entries%rowtype;
begin
  select * into reg from cd_registers where id = new.register_id for update; -- serialise per register
  if reg.closed_at is not null then
    raise exception 'Register is closed';
  end if;

  if new.entry_type = 'correction' then
    select * into orig from cd_entries where id = new.corrects_entry_id;
    if orig.id is null or orig.register_id <> new.register_id then
      raise exception 'Correction must reference an entry in the same register';
    end if;
    if orig.entry_type = 'correction' then
      raise exception 'Correct the original entry, not a correction';
    end if;
  end if;

  select coalesce(max(seq), 0) + 1 into new.seq from cd_entries where register_id = new.register_id;
  new.recorded_at := now();
  return new;
end $$;
create trigger cd_entries_bi before insert on cd_entries for each row execute function cd_entries_before_insert();

create trigger cd_entries_no_update before update or delete on cd_entries for each row execute function block_mutation();

-- ───────────────────────── Effective ledger & running balance ─────────────────────────
-- For each original entry, the latest correction (if any) supplies the effective values.
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
  case e.entry_type
    when 'receipt' then e.quantity
    when 'supply' then -e.quantity
    when 'destruction' then -e.quantity
    else 0  -- patient returns are never pharmacy stock (scenario: patient-returned CDs)
  end as stock_effect,
  sum(case e.entry_type
        when 'receipt' then e.quantity
        when 'supply' then -e.quantity
        when 'destruction' then -e.quantity
        else 0 end)
    over (partition by e.register_id order by e.seq rows between unbounded preceding and current row) as running_balance
from effective e;

-- ───────────────────────── Audit trail (append-only) ─────────────────────────
create table audit_log (
  id bigint generated always as identity primary key,
  pharmacy_id uuid,
  occurred_at timestamptz not null default now(),
  action text not null,
  staff_id uuid,
  staff_name text,
  auth_user_id uuid,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'
);
create index on audit_log (pharmacy_id, occurred_at desc);
create trigger audit_log_no_update before update or delete on audit_log for each row execute function block_mutation();

create or replace function audit_cd_entry() returns trigger language plpgsql as $$
declare ph uuid; sname text;
begin
  select pharmacy_id into ph from cd_registers where id = new.register_id;
  select full_name into sname from staff where id = new.recorded_by_staff_id;
  insert into audit_log (pharmacy_id, action, staff_id, staff_name, auth_user_id, target_table, target_id, details)
  values (ph, 'cd_entry.' || new.entry_type, new.recorded_by_staff_id, sname, new.recorded_by_auth_user,
          'cd_entries', new.id, to_jsonb(new));
  return new;
end $$;
create trigger cd_entries_audit after insert on cd_entries for each row execute function audit_cd_entry();

-- ───────────────────────── Lock everything to the server ─────────────────────────
alter table pharmacies enable row level security;
alter table pharmacy_accounts enable row level security;
alter table staff enable row level security;
alter table cd_products enable row level security;
alter table cd_registers enable row level security;
alter table cd_entries enable row level security;
alter table audit_log enable row level security;
alter table scans enable row level security;
revoke all on cd_ledger from anon, authenticated;
