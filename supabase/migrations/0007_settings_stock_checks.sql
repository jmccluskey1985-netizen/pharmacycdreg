-- Settings page: per-pharmacy preferences, low-stock levels, and witnessed stock checks.
alter table pharmacies add column if not exists halo_enabled boolean not null default false;
alter table pharmacies add column if not exists invoice_names text;           -- company name(s) on invoices, e.g. "Bibola Ltd"
alter table pharmacies add column if not exists lock_minutes int not null default 15 check (lock_minutes between 2 and 120);
alter table pharmacies add column if not exists locum_default_days int not null default 14 check (locum_default_days between 1 and 365);
alter table pharmacies add column if not exists stock_check_frequency text not null default 'monthly'
  check (stock_check_frequency in ('off', 'weekly', 'fortnightly', 'monthly'));

alter table cd_registers add column if not exists low_stock_level numeric check (low_stock_level is null or low_stock_level >= 0);

-- A stock check: physical count vs the register balance at that moment. Append-only, like the register.
create table if not exists stock_checks (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  register_id uuid not null references cd_registers(id) on delete cascade,
  counted numeric not null check (counted >= 0),
  register_balance numeric not null,
  notes text,
  checked_by_staff_id uuid not null references staff(id),
  checked_by_name text not null,
  checked_at timestamptz not null default now()
);
create index if not exists stock_checks_reg on stock_checks (register_id, checked_at desc);
alter table stock_checks enable row level security;
drop trigger if exists stock_checks_no_update on stock_checks;
create trigger stock_checks_no_update before update or delete on stock_checks for each row execute function block_mutation();
