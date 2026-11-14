-- Patient matching columns and normalisers (0016).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL %', label; end if; raise notice 'ok   %', label; end $$;
select pg_temp.ok(patient_name_key('O''Brien') = 'obrien' and patient_name_key('O Brien') = 'obrien' and patient_name_key('Ní Bhriain') = 'nibhriain', 'surname key matches the app (apostrophes, spaces, accents)');
select pg_temp.ok(patient_eircode('14 Main St, Ennis, v95 x2y3') = 'V95X2Y3' and patient_eircode('No code here') is null, 'eircode pulled out of an address');
insert into pharmacies(id,name,address) values ('aaaaaaaa-0000-0000-0000-000000000001','P','Ennis');
insert into patients(pharmacy_id,first_name,surname,address) values ('aaaaaaaa-0000-0000-0000-000000000001','Mary','O''Brien','3 Church Rd, Ennis V95 X2Y3');
update patients set name_key = patient_name_key(surname), eircode = patient_eircode(address) where name_key is null;
select pg_temp.ok((select name_key = 'obrien' and eircode = 'V95X2Y3' from patients where surname = 'O''Brien'), 'existing patients are backfilled');

-- Merging: only the patient link on a register line may move, and only through merge_patient_links
insert into auth.users values ('a0000000-0000-0000-0000-0000000000aa');
insert into staff(id,pharmacy_id,full_name,role) values ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','A Pharm','supervising_pharmacist');
insert into cd_products(id,drug_name,schedule,class_name,form,strength,unit,brand) values ('aaaaaaaa-0000-0000-0000-000000000003','Oxycodone hydrochloride',2,'Oxycodone','capsule','10mg','capsules','OxyNorm');
insert into cd_registers(id,pharmacy_id,product_id,opened_by_staff_id) values ('aaaaaaaa-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002');
insert into patients(id,pharmacy_id,first_name,surname) values ('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','Mary','OBrien'), ('aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-000000000001','Mary','O''Brien');
insert into cd_entries(register_id,entry_type,transaction_date,quantity,supplier_name,supplier_address,recorded_by_staff_id,recorded_by_auth_user)
  values ('aaaaaaaa-0000-0000-0000-000000000004','receipt',current_date,28,'Wholesaler','Dublin','aaaaaaaa-0000-0000-0000-000000000002','a0000000-0000-0000-0000-0000000000aa');
insert into cd_entries(register_id,entry_type,transaction_date,quantity,recipient_name,recipient_address,prescriber_name,prescriber_address,patient_id,recorded_by_staff_id,recorded_by_auth_user)
  values ('aaaaaaaa-0000-0000-0000-000000000004','supply',current_date,10,'Mary OBrien','Ennis','Dr A','Ennis','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000002','a0000000-0000-0000-0000-0000000000aa');
do $$ begin
  begin update cd_entries set patient_id = 'aaaaaaaa-0000-0000-0000-0000000000d2' where patient_id = 'aaaaaaaa-0000-0000-0000-0000000000d1'; raise exception 'FAIL direct relink allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.ok(true, 'a direct update of a register line is still refused');
select pg_temp.ok(merge_patient_links('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d2') = 1, 'merge moves the patient link');
select pg_temp.ok(not exists (select 1 from cd_entries where patient_id = 'aaaaaaaa-0000-0000-0000-0000000000d1'), 'no lines left on the duplicate');
do $$ begin
  begin update cd_entries set quantity = 99 where register_id = 'aaaaaaaa-0000-0000-0000-000000000004'; raise exception 'FAIL edit allowed after merge';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select pg_temp.ok(true, 'other edits are still refused after a merge');
select pg_temp.ok((select ok from verify_register_chain('aaaaaaaa-0000-0000-0000-000000000004')), 'register fingerprint chain still verifies after a merge');
