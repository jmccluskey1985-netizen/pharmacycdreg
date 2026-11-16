-- 0022: Opioid Substitution Treatment (methadone / buprenorphine) prescriptions dispensed in
-- instalments. Each HSE OST form is kept once per pharmacy (by its serial number) with its
-- schedule; every dispensing on it is kept too, linked to the register line once it's recorded.
-- These are reference records: the register itself stays in cd_entries. Safe to re-run.
create table if not exists ost_prescriptions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  serial_no text not null,
  patient_id uuid references patients(id),
  patient_name text,
  treatment_card_no text,
  product text check (product is null or product in ('methadone', 'buprenorphine', 'buprenorphine_naloxone')),
  drug_written text,
  register_id uuid references cd_registers(id),
  daily_dose numeric,
  days_at_dose numeric,
  total_qty numeric,
  date_prescribed date,
  from_date date,
  to_date date,
  schedule jsonb not null default '{}'::jsonb,   -- instalment and supervision boxes as read
  prescriber_name text,
  prescriber_registration text,
  scan_id uuid references scans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, serial_no)
);
create index if not exists ost_prescriptions_patient on ost_prescriptions (pharmacy_id, patient_id);
alter table ost_prescriptions enable row level security;

create table if not exists ost_dispensings (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references ost_prescriptions(id) on delete cascade,
  dispensed_on date not null,
  quantity numeric not null check (quantity > 0),
  mode text check (mode is null or mode in ('supervised', 'take_away')),
  entry_id uuid references cd_entries(id),
  created_at timestamptz not null default now(),
  unique (prescription_id, dispensed_on, mode, quantity)
);
create index if not exists ost_dispensings_date on ost_dispensings (prescription_id, dispensed_on);
alter table ost_dispensings enable row level security;
