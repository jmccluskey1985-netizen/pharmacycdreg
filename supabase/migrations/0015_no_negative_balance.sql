-- 0015: the database itself refuses any register line that leaves the balance below zero
-- (the app already checks; this is the backstop for anything that bypasses it). Safe to re-run.
create or replace function cd_entries_balance_guard() returns trigger language plpgsql as $$
declare bal numeric;
begin
  select running_balance into bal from cd_ledger where register_id = new.register_id order by seq desc limit 1;
  if bal < 0 then
    raise exception 'This would take the balance below zero (%). Check the quantity or record the missing receipt first.', bal using errcode = 'check_violation';
  end if;
  return null;
end $$;
drop trigger if exists cd_entries_zz_balance_guard on cd_entries;
create trigger cd_entries_zz_balance_guard after insert on cd_entries for each row execute function cd_entries_balance_guard();
