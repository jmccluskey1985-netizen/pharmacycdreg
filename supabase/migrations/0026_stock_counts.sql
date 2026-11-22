-- Stock counts: a count of every CD book that can take more than one day. While a count is open,
-- each line's count, date and note can be changed (saved as you go). Finishing it records each
-- counted line as a permanent stock check (stock_checks); a finished count can't be changed.
create table if not exists stock_counts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'finished')),
  started_at timestamptz not null default now(),
  started_by_staff_id uuid references staff(id),
  started_by_name text,
  finished_at timestamptz,
  finished_by_staff_id uuid references staff(id),
  finished_by_name text
);
create index if not exists stock_counts_pharmacy on stock_counts (pharmacy_id, started_at desc);
create unique index if not exists stock_counts_one_open on stock_counts (pharmacy_id) where status = 'open';
alter table stock_counts enable row level security;

create table if not exists stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_counts(id) on delete cascade,
  register_id uuid not null references cd_registers(id) on delete cascade,
  counted numeric check (counted >= 0),
  balance_at_count numeric,
  counted_at timestamptz,
  note text,
  counted_by_staff_id uuid references staff(id),
  counted_by_name text,
  stock_check_id uuid references stock_checks(id),
  updated_at timestamptz not null default now(),
  unique (count_id, register_id)
);
alter table stock_count_lines enable row level security;

-- A finished count and its lines are final
create or replace function stock_count_is_final() returns trigger language plpgsql set search_path = public as $$
declare st text;
begin
  if tg_table_name = 'stock_counts' then
    if old.status = 'finished' then raise exception 'A finished stock count can''t be changed'; end if;
  else
    select status into st from stock_counts where id = old.count_id;
    if st = 'finished' then raise exception 'A finished stock count can''t be changed'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists stock_counts_final on stock_counts;
create trigger stock_counts_final before update or delete on stock_counts for each row execute function stock_count_is_final();
drop trigger if exists stock_count_lines_final on stock_count_lines;
create trigger stock_count_lines_final before update or delete on stock_count_lines for each row execute function stock_count_is_final();
