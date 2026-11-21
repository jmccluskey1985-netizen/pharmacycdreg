-- Quarantine, destruction book, stock checks, register lifecycle, balance guard, access lock-down.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.expect_error(stmt text, pattern text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if pattern is not null and sqlerrm !~* pattern then raise exception 'wrong error for [%]: %', stmt, sqlerrm; end if; return;
  end;
  raise exception 'expected an error, none raised: %', stmt;
end $$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL %', label; end if; raise notice 'ok   %', label; end $$;

insert into auth.users values ('b0000000-0000-0000-0000-000000000001');
insert into pharmacies(id,name,address) values ('55555555-5555-5555-5555-555555555555','Second Pharmacy','Galway');
insert into staff(id,pharmacy_id,full_name,role) values ('66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555','B Pharm','pharmacist');
insert into cd_products(id,drug_name,schedule,class_name,form,strength,unit,brand) values ('77777777-7777-7777-7777-777777777777','Morphine sulfate',2,'Morphine','prolonged-release tablet','10mg','tablets','MST Continus');
insert into cd_registers(id,pharmacy_id,product_id,opened_by_staff_id) values ('88888888-8888-8888-8888-888888888888','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666');
insert into cd_entries(register_id,entry_type,transaction_date,quantity,supplier_name,supplier_address,recorded_by_staff_id,recorded_by_auth_user)
  values ('88888888-8888-8888-8888-888888888888','receipt',current_date,60,'United Drug','Dublin','66666666-6666-6666-6666-666666666666','b0000000-0000-0000-0000-000000000001');

-- Balance guard
select pg_temp.expect_error($$ insert into cd_entries(register_id,entry_type,transaction_date,quantity,recipient_name,recipient_address,recorded_by_staff_id,recorded_by_auth_user) values ('88888888-8888-8888-8888-888888888888','supply',current_date,61,'Over Supply','Galway','66666666-6666-6666-6666-666666666666','b0000000-0000-0000-0000-000000000001') $$, 'below zero');
select pg_temp.ok((select count(*) = 1 from cd_entries where register_id = '88888888-8888-8888-8888-888888888888'), 'a supply larger than the balance is refused by the database');

-- One live register per product; closed registers refuse entries
select pg_temp.expect_error($$ insert into cd_registers(pharmacy_id,product_id,opened_by_staff_id) values ('55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666') $$, 'cd_registers_one_live');
select pg_temp.ok(true, 'only one live register per product per pharmacy');

-- Quarantine guard
insert into quarantine_items(id,pharmacy_id,register_id,quantity,reason,created_by_staff_id) values ('99999999-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555','88888888-8888-8888-8888-888888888888',10,'expired','66666666-6666-6666-6666-666666666666');
select pg_temp.expect_error($$ delete from quarantine_items $$, 'cannot be deleted');
select pg_temp.expect_error($$ update quarantine_items set quantity = 5 $$, 'cannot be changed');
select pg_temp.expect_error($$ insert into quarantine_items(pharmacy_id,register_id,quantity,reason,created_by_staff_id) values ('55555555-5555-5555-5555-555555555555','88888888-8888-8888-8888-888888888888',1,'lost','66666666-6666-6666-6666-666666666666') $$, 'check');
update quarantine_items set status = 'released', release_reason = 'In date after all', resolved_at = now() where id = '99999999-0000-0000-0000-000000000001';
select pg_temp.expect_error($$ update quarantine_items set status = 'awaiting' $$, 'already closed');
select pg_temp.ok(true, 'quarantine: no delete, amount fixed, closed records are final, reasons checked');

-- Destruction record book guard
select pg_temp.expect_error($$ insert into destruction_book(pharmacy_id,kind,drug,quantity,received_date,received_by_staff_id,received_by_name) values ('55555555-5555-5555-5555-555555555555','patient_return','OxyNorm 5mg',10,current_date,'66666666-6666-6666-6666-666666666666','B Pharm') $$, 'return_by');
insert into destruction_book(id,pharmacy_id,kind,drug,quantity,returned_by_name,received_date,received_by_staff_id,received_by_name) values ('99999999-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555','patient_return','OxyNorm 5mg',10,'Mary Kelly',current_date,'66666666-6666-6666-6666-666666666666','B Pharm');
select pg_temp.expect_error($$ update destruction_book set quantity = 9 $$, 'cannot be changed');
select pg_temp.expect_error($$ update destruction_book set witness_name = 'X' $$, 'date and person');
update destruction_book set destroyed_date = current_date, destroyed_by_staff_id = '66666666-6666-6666-6666-666666666666', destroyed_by_name = 'B Pharm' where id = '99999999-0000-0000-0000-000000000002';
select pg_temp.expect_error($$ update destruction_book set destruction_method = 'kit' $$, 'already recorded');
select pg_temp.expect_error($$ delete from destruction_book $$, 'cannot be deleted');
select pg_temp.ok(true, 'destruction book: returner required, received details fixed, destruction recorded once, no delete');

-- Stock checks and scans are append-only
insert into stock_checks(pharmacy_id,register_id,counted,register_balance,checked_by_staff_id,checked_by_name) values ('55555555-5555-5555-5555-555555555555','88888888-8888-8888-8888-888888888888',60,60,'66666666-6666-6666-6666-666666666666','B Pharm');
select pg_temp.expect_error($$ update stock_checks set counted = 1 $$, 'append-only');
select pg_temp.expect_error($$ delete from stock_checks $$, 'append-only');
select pg_temp.ok(true, 'stock checks cannot be changed or deleted');

-- Closing a register stops new entries
update cd_registers set closed_at = now(), closed_by_staff_id = '66666666-6666-6666-6666-666666666666' where id = '88888888-8888-8888-8888-888888888888';
select pg_temp.expect_error($$ insert into cd_entries(register_id,entry_type,transaction_date,quantity,supplier_name,supplier_address,recorded_by_staff_id,recorded_by_auth_user) values ('88888888-8888-8888-8888-888888888888','receipt',current_date,1,'X','Y','66666666-6666-6666-6666-666666666666','b0000000-0000-0000-0000-000000000001') $$, 'closed');
select pg_temp.ok(true, 'a closed register refuses new entries');

-- Value checks
select pg_temp.expect_error($$ insert into dispense_reminders(pharmacy_id,title,frequency,next_due) values ('55555555-5555-5555-5555-555555555555','x','hourly',current_date) $$, 'check');
select pg_temp.expect_error($$ insert into feedback(kind,message) values ('spam','hello there') $$, 'check');
insert into feedback(kind,message,status) values ('idea','A good idea','read');
select pg_temp.ok(true, 'reminder frequency and feedback kind/status are validated');

-- Every app table is locked down: row level security on, no browser access
select pg_temp.ok((select coalesce(string_agg(tablename, ', '), '') = '' from pg_tables where schemaname = 'public' and not rowsecurity),
  'row level security is on for every table: ' || coalesce((select string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity), 'none missing'));
select pg_temp.ok((select count(*) = 0 from pg_policies where schemaname = 'public'), 'no browser access policies exist (server-only access)');

-- 0018: shared attempt limits (statements run in order; side effects matter)
do $$ declare a boolean; b boolean; c boolean; d boolean; r integer; begin
  select ok into a from rate_limit_hit('pin:test', 3, 60);
  select ok into a from rate_limit_hit('pin:test', 3, 60);
  select ok into b from rate_limit_hit('pin:test', 3, 60);
  select ok, retry_after into c, r from rate_limit_hit('pin:test', 3, 60);
  if not (a and b and not c and r between 1 and 60) then raise exception 'FAIL attempt limit'; end if;
  if exists (select 1 from rate_limits where key_hash like '%pin%') then raise exception 'FAIL key stored in clear'; end if;
  select ok into a from rate_limit_hit('fail:test', 2, 60, 0);
  select ok into b from rate_limit_hit('fail:test', 2, 60);
  select ok into b from rate_limit_hit('fail:test', 2, 60);
  select ok into d from rate_limit_hit('fail:test', 2, 60, 0);
  if not (a and b and not d) then raise exception 'FAIL peek'; end if;
end $$;
select pg_temp.ok(true, 'attempt limits: refused after the limit, keys stored hashed, failures can be checked without adding');

-- 0020: superintendent / support pharmacist roles; superintendent login across pharmacies
insert into staff(pharmacy_id,full_name,role) select id,'Super Intendent','superintendent_pharmacist' from pharmacies limit 1;
insert into staff(pharmacy_id,full_name,role) select id,'Sue Port','support_pharmacist' from pharmacies limit 1;
select pg_temp.ok((select count(*) = 2 from staff where role in ('superintendent_pharmacist','support_pharmacist')) and to_regclass('public.pharmacy_logins') is not null, 'superintendent and support pharmacist roles; pharmacy_logins table');

-- 0021: every public function pins its search_path
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')), 'every database function has a fixed search path');

-- 0022: OST prescriptions held once per serial; instalments kept per date
insert into ost_prescriptions(pharmacy_id, serial_no, product, daily_dose, days_at_dose, total_qty) select id, '9000001', 'methadone', 60, 7, 420 from pharmacies limit 1;
insert into ost_dispensings(prescription_id, dispensed_on, quantity, mode) select id, current_date, 60, 'supervised' from ost_prescriptions where serial_no = '9000001';
insert into ost_dispensings(prescription_id, dispensed_on, quantity, mode) select id, current_date, 360, 'take_away' from ost_prescriptions where serial_no = '9000001';
select pg_temp.expect_error($$ insert into ost_prescriptions(pharmacy_id, serial_no) select id, '9000001' from pharmacies limit 1 $$, 'duplicate key');
select pg_temp.ok((select count(*) = 2 from ost_dispensings), 'OST form held once per serial number; supervised and take-away rows kept');

-- 0023: OST patients and drug codes
update patients set treatment_card_no = 'PH4417', is_ost = true where id = (select id from patients limit 1);
select pg_temp.ok((select count(*) = 1 from patients where is_ost and treatment_card_no = 'PH4417') and to_regclass('public.ost_drug_codes') is not null, 'OST patients flagged with treatment card; drug-code table');

-- 0025: risk assessments: one draft per pharmacy; a signed version can never be changed or deleted
insert into risk_assessments(pharmacy_id, data) select id, '{"head":{"pharmacy":"Test"}}' from pharmacies limit 1;
select pg_temp.expect_error($$ insert into risk_assessments(pharmacy_id) select id from pharmacies limit 1 $$, 'duplicate key');
update risk_assessments set status = 'signed', signed_by_name = 'Aoife Byrne', signed_at = now() where status = 'draft';
select pg_temp.expect_error($$ update risk_assessments set data = '{}' where status = 'signed' $$, 'can''t be changed');
select pg_temp.expect_error($$ delete from risk_assessments where status = 'signed' $$, 'can''t be changed');
select pg_temp.ok((select count(*) = 1 from risk_assessments where status = 'signed' and data->'head'->>'pharmacy' = 'Test') and (select relrowsecurity from pg_class where relname = 'risk_assessments'), 'risk assessment: one draft each, signed version final, RLS on');
