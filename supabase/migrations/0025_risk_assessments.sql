-- Risk assessment for using the electronic CD register (PSI guidance: done by those in a
-- statutory governance role before adopting electronic record-keeping). One working draft per
-- pharmacy plus every signed version. A signed version can never be changed or deleted.
create table if not exists risk_assessments (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'signed')),
  signed_by_staff_id uuid references staff(id),
  signed_by_name text,
  signed_by_psi text,
  signed_by_role text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists risk_assessments_pharmacy_idx on risk_assessments (pharmacy_id, created_at desc);
create unique index if not exists risk_assessments_one_draft on risk_assessments (pharmacy_id) where status = 'draft';
alter table risk_assessments enable row level security;

create or replace function risk_assessment_signed_is_final() returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'signed' then
    raise exception 'A signed risk assessment can''t be changed; start a new version instead';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists risk_assessments_final on risk_assessments;
create trigger risk_assessments_final before update or delete on risk_assessments
  for each row execute function risk_assessment_signed_is_final();
