-- Structured patient records, same shape as PharmacyConsultation.ie's patients table
-- (first name / surname / DOB / address / phone / GMS / IHI / GP). CDReg's own copy:
-- nothing is shared with PharmacyConsultation. Server-only access (RLS on, no policies).
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  first_name text not null,
  surname text not null default '',
  date_of_birth date,
  address text,
  phone text,
  gms_number text,
  ihi_number text,
  gp_name text,           -- usual doctor, filled into supplies
  gp_address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists patients_search on patients (pharmacy_id, lower(surname), lower(first_name)) where is_active;
create index if not exists patients_gms on patients (pharmacy_id, gms_number) where gms_number is not null;
alter table patients enable row level security;

-- Link register lines to a patient record. The register's own name/address columns are
-- still written on every line (they are the statutory record); the link is for reports.
alter table cd_entries add column if not exists patient_id uuid references patients(id);
create index if not exists cd_entries_patient on cd_entries (patient_id) where patient_id is not null;
