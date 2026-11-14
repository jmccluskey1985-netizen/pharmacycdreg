-- 0016: patient matching (docs/PATIENT_MATCHING.md). Extra identifiers so the same person isn't
-- made twice by a different spelling of their name or address. Safe to re-run.
alter table patients add column if not exists dps_number text;
alter table patients add column if not exists lti_number text;
alter table patients add column if not exists hospital_mrn text;
alter table patients add column if not exists eircode text;          -- normalised: upper case, no space
alter table patients add column if not exists name_key text;         -- normalised surname (src/lib/patient-match.ts nameKey)
alter table patients add column if not exists merged_into uuid references patients(id);

create index if not exists patients_dob     on patients (pharmacy_id, date_of_birth) where is_active;
create index if not exists patients_eircode on patients (pharmacy_id, eircode)       where is_active and eircode is not null;
create index if not exists patients_namekey on patients (pharmacy_id, name_key)      where is_active;
create index if not exists patients_dps     on patients (pharmacy_id, dps_number)    where dps_number is not null;
create index if not exists patients_lti     on patients (pharmacy_id, lti_number)    where lti_number is not null;
create index if not exists patients_mrn     on patients (pharmacy_id, hospital_mrn)  where hospital_mrn is not null;

-- Same normalisation as nameKey() / extractEircode() in src/lib/patient-match.ts (the app
-- keeps both up to date on every write; this fills in rows that already exist).
create or replace function patient_name_key(s text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(translate(coalesce(s, ''), 'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙ', 'aeiouAEIOUaeiouAEIOU'), '[^A-Za-z]', '', 'g')), '')
$$;
create or replace function patient_eircode(s text) returns text language sql immutable as $$
  select (regexp_match(upper(coalesce(s, '')), '(?:^|[^A-Z0-9])([AC-FHKNPRTV-Y][0-9]{2}|D6W) ?([0-9AC-FHKNPRTV-Y]{4})(?:[^A-Z0-9]|$)'))[1]
      || (regexp_match(upper(coalesce(s, '')), '(?:^|[^A-Z0-9])([AC-FHKNPRTV-Y][0-9]{2}|D6W) ?([0-9AC-FHKNPRTV-Y]{4})(?:[^A-Z0-9]|$)'))[2]
$$;
update patients set name_key = patient_name_key(surname) where name_key is null;
update patients set eircode = patient_eircode(address) where eircode is null and address is not null;

-- Merging duplicate patients (POST /api/patients/[id]/merge). Register lines stay append-only:
-- the only change ever allowed is moving the patient_id link, and only inside
-- merge_patient_links(). patient_id is not part of the line fingerprint (0013), so the
-- integrity check still passes. Every other UPDATE or DELETE is rejected as before.
create or replace function cd_entries_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and current_setting('cdreg.patient_relink', true) = 'on'
     and (to_jsonb(new) - 'patient_id') = (to_jsonb(old) - 'patient_id') then
    return new;
  end if;
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op;
end $$;
drop trigger if exists cd_entries_no_update on cd_entries;
create trigger cd_entries_no_update before update or delete on cd_entries for each row execute function cd_entries_guard();

create or replace function merge_patient_links(from_id uuid, into_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from patients a join patients b on a.pharmacy_id = b.pharmacy_id where a.id = from_id and b.id = into_id) then
    raise exception 'Patients must belong to the same pharmacy';
  end if;
  perform set_config('cdreg.patient_relink', 'on', true);
  update cd_entries set patient_id = into_id where patient_id = from_id;
  get diagnostics n = row_count;
  perform set_config('cdreg.patient_relink', 'off', true);
  return n;
end $$;
revoke all on function merge_patient_links(uuid, uuid) from public, anon, authenticated;
