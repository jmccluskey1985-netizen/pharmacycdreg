-- 0023: the pharmacy's opioid substitution (OST) patients and the drug codes on OST forms.
-- - patients: treatment card no. (unique to the person, so it identifies them on every form),
--   flagged as OST, with their usual register (product) and dose
-- - ost_drug_codes: the pharmacy section's DRUG CODE (e.g. 46115) → which register it is, learned
--   when a supply is recorded, so the next form with that code goes to the right product
-- Safe to re-run.
alter table patients add column if not exists treatment_card_no text;
alter table patients add column if not exists is_ost boolean not null default false;
alter table patients add column if not exists ost_register_id uuid references cd_registers(id);
alter table patients add column if not exists ost_daily_dose numeric;
alter table patients add column if not exists ost_schedule text;
-- The dispensing system's own patient code, printed on bag labels in brackets, e.g. "Michelle Walsh (W75)"
alter table patients add column if not exists pmr_code text;
create index if not exists patients_pmr_code on patients (pharmacy_id, pmr_code) where pmr_code is not null;
create index if not exists patients_treatment_card on patients (pharmacy_id, treatment_card_no) where treatment_card_no is not null;
create index if not exists patients_ost on patients (pharmacy_id) where is_ost;

alter table ost_prescriptions add column if not exists drug_code text;

create table if not exists ost_drug_codes (
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  drug_code text not null,
  register_id uuid not null references cd_registers(id),
  label text,
  updated_at timestamptz not null default now(),
  primary key (pharmacy_id, drug_code)
);
alter table ost_drug_codes enable row level security;
