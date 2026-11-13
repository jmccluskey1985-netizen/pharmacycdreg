-- Register integrity rules enforced by the database itself. Any failed check aborts with an error.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function pg_temp.expect_error(stmt text, pattern text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if pattern is not null and sqlerrm !~* pattern then raise exception 'wrong error for [%]: %', stmt, sqlerrm; end if;
    return;
  end;
  raise exception 'expected an error, none raised: %', stmt;
end $$;
create or replace function pg_temp.eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;

insert into auth.users values ('a0000000-0000-0000-0000-000000000001');
insert into pharmacies(id,name,address) values ('11111111-1111-1111-1111-111111111111','Test Pharmacy','Ennis');
insert into pharmacy_accounts(auth_user_id,pharmacy_id) values ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
insert into staff(id,pharmacy_id,full_name,role) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','A Pharm','supervising_pharmacist');
insert into cd_products(id,drug_name,schedule,class_name,form,strength,unit,brand) values ('33333333-3333-3333-3333-333333333333','Oxycodone hydrochloride',2,'Oxycodone','capsule','5mg','capsules','OxyNorm');
insert into cd_registers(id,pharmacy_id,product_id,opened_by_staff_id) values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222');

create temp view r as select * from cd_ledger where register_id = '44444444-4444-4444-4444-444444444444';
create or replace function pg_temp.add(t text, q numeric, extra text default '') returns uuid language plpgsql as $$
declare id uuid;
begin
  execute format('insert into cd_entries(register_id,entry_type,transaction_date,quantity,recorded_by_staff_id,recorded_by_auth_user%s) values (%L,%L,current_date,%s,%L,%L%s) returning id',
    case when extra = '' then '' else ',' || split_part(extra, '|', 1) end,
    '44444444-4444-4444-4444-444444444444', t, q, '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001',
    case when extra = '' then '' else ',' || split_part(extra, '|', 2) end) into id;
  return id;
end $$;

-- 1. Statutory fields per entry type
select pg_temp.expect_error($$ select pg_temp.add('receipt', 10) $$, 'receipt_fields');
select pg_temp.expect_error($$ select pg_temp.add('supply', 10) $$, 'supply_fields');
select pg_temp.expect_error($$ select pg_temp.add('destruction', 10) $$, 'destruction_fields');
select pg_temp.expect_error($$ select pg_temp.add('adjustment_out', 1, 'notes|''short''') $$, 'adjustment_fields');
select pg_temp.eq(1, 1, 'receipt / supply / destruction / adjustment refuse missing statutory fields');

-- 2. Balances
select pg_temp.add('receipt', 100, 'supplier_name,supplier_address|''Uniphar'',''Dublin''');
select pg_temp.add('supply', 28, 'recipient_name,recipient_address|''Mary Kelly'',''Ennis''');
select pg_temp.add('patient_return', 5, 'recipient_name|''Mary Kelly''');
select pg_temp.add('destruction', 2, 'witness_name,witness_role|''Sgt Ryan'',''Garda''');
select pg_temp.add('adjustment_in', 1, 'notes|''Stock check: found one capsule in the returns bin''');
select pg_temp.eq((select running_balance from r order by seq desc limit 1), 71.000, 'running balance: 100 - 28 (return ignored) - 2 + 1 = 71');
select pg_temp.eq((select array_agg(seq order by seq) from r), array[1,2,3,4,5]::bigint[], 'lines numbered 1..5 automatically');

-- 3. Append-only
select pg_temp.expect_error($$ update cd_entries set quantity = 1 $$, 'append-only');
select pg_temp.expect_error($$ delete from cd_entries $$, 'append-only');
select pg_temp.expect_error($$ update audit_log set action = 'x' $$, 'append-only');
select pg_temp.expect_error($$ delete from audit_log $$, 'append-only');
select pg_temp.eq(1, 1, 'register lines and audit trail cannot be updated or deleted');

-- 4. Corrections
select pg_temp.expect_error(format($$ insert into cd_entries(register_id,entry_type,transaction_date,quantity,corrects_entry_id,correction_reason,recorded_by_staff_id,recorded_by_auth_user) values ('44444444-4444-4444-4444-444444444444','correction',current_date,20,%L,'oops','22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000001') $$, (select id from r where seq = 2)), 'correction_fields');
insert into cd_entries(register_id,entry_type,transaction_date,quantity,corrects_entry_id,correction_reason,recorded_by_staff_id,recorded_by_auth_user)
  values ('44444444-4444-4444-4444-444444444444','correction',current_date,20,(select id from r where seq = 2),'Entered 28 in error; 20 supplied','22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000001');
select pg_temp.eq((select quantity from r where seq = 2), 20.000, 'correction changes the effective amount');
select pg_temp.eq((select running_balance from r order by seq desc limit 1), 79.000, 'balance recalculated after correction');
select pg_temp.eq((select count(*) from cd_entries where register_id = '44444444-4444-4444-4444-444444444444'), 6::bigint, 'original line kept alongside its correction');
select pg_temp.expect_error(format($$ insert into cd_entries(register_id,entry_type,transaction_date,quantity,corrects_entry_id,correction_reason,recorded_by_staff_id,recorded_by_auth_user) values ('44444444-4444-4444-4444-444444444444','correction',current_date,1,%L,'second level','22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000001') $$, (select id from cd_entries where entry_type = 'correction' limit 1)), 'Correct the original');

-- 5. Audit trail written by the database
select pg_temp.eq((select count(*) from audit_log where target_table = 'cd_entries' and pharmacy_id = '11111111-1111-1111-1111-111111111111'), 6::bigint, 'every line written to the audit trail by trigger');

-- 6. Integrity chain
select pg_temp.eq((select ok from verify_register_chain('44444444-4444-4444-4444-444444444444')), true, 'register fingerprint chain verifies');
select pg_temp.eq((select ok from verify_audit_chain('11111111-1111-1111-1111-111111111111')), true, 'audit fingerprint chain verifies');
alter table cd_entries disable trigger cd_entries_no_update;
update cd_entries set quantity = 27 where register_id = '44444444-4444-4444-4444-444444444444' and seq = 2;
select pg_temp.eq((select broken_seq from verify_register_chain('44444444-4444-4444-4444-444444444444')), 2::bigint, 'a direct database edit is detected at line 2');
update cd_entries set quantity = 28 where register_id = '44444444-4444-4444-4444-444444444444' and seq = 2;
select pg_temp.eq((select ok from verify_register_chain('44444444-4444-4444-4444-444444444444')), true, 'restoring the original value verifies again');
delete from cd_entries where register_id = '44444444-4444-4444-4444-444444444444' and seq = 4;
select pg_temp.eq((select reason from verify_register_chain('44444444-4444-4444-4444-444444444444')), 'line 4 is missing', 'a deleted line is detected');
alter table cd_entries enable trigger cd_entries_no_update;
