-- Expired / damaged stock awaiting destruction, and the separate CD Destruction Record Book.
--
-- 1. quarantine_items — Schedule 2 pharmacy stock set aside (expired, damaged) in the CD safe,
--    labelled "CDs for destruction". It is STILL STOCK: it stays in the register balance until
--    its witnessed destruction is recorded (as a 'destruction' line in that drug's register).
-- 2. destruction_book — the PSI "Controlled Drugs Destruction Record Book": patient-returned CDs
--    (Schedules 2, 3, 4) and expired Schedule 3/4 pharmacy stock. Not part of the CD register
--    and never in a register balance. A row is written when received; its destruction details
--    are filled in once, later. Nothing can be deleted or rewritten.
-- Server-only access (RLS on, no policies), like every other table.

create table if not exists quarantine_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  register_id uuid not null references cd_registers(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  reason text not null check (reason in ('expired', 'damaged', 'recalled', 'other')),
  batch text,
  expiry_date date,
  notes text,
  status text not null default 'awaiting' check (status in ('awaiting', 'destroyed', 'released')),
  created_by_staff_id uuid not null references staff(id),
  created_at timestamptz not null default now(),
  destroyed_entry_id uuid references cd_entries(id),
  resolved_by_staff_id uuid references staff(id),
  resolved_at timestamptz,
  release_reason text
);
create index if not exists quarantine_items_open on quarantine_items (pharmacy_id, register_id) where status = 'awaiting';
alter table quarantine_items enable row level security;

-- Once resolved (destroyed / released) a quarantine row is final; rows are never deleted.
create or replace function quarantine_items_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'quarantine records cannot be deleted'; end if;
  if old.status <> 'awaiting' then raise exception 'this quarantine record is already closed'; end if;
  if new.quantity <> old.quantity or new.register_id <> old.register_id or new.pharmacy_id <> old.pharmacy_id
     or new.created_at <> old.created_at or new.created_by_staff_id <> old.created_by_staff_id then
    raise exception 'quarantine details cannot be changed — release it and quarantine again';
  end if;
  return new;
end $$;
drop trigger if exists quarantine_items_guard on quarantine_items;
create trigger quarantine_items_guard before update or delete on quarantine_items for each row execute function quarantine_items_guard();

create table if not exists destruction_book (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  kind text not null check (kind in ('patient_return', 'stock_sch34')),
  -- what
  drug text not null,               -- e.g. "OxyNorm 5mg capsules", "Diazepam 5mg tablets"
  schedule int check (schedule between 2 and 5),
  quantity numeric not null check (quantity > 0),
  unit text not null default 'units',
  batch text,
  expiry_date date,
  -- received (patient returns: who returned it)
  returned_by_name text,
  returned_by_address text,
  received_date date not null,
  received_by_staff_id uuid not null references staff(id),
  received_by_name text not null,
  notes text,
  -- destroyed (filled in once)
  destroyed_date date,
  destroyed_by_staff_id uuid references staff(id),
  destroyed_by_name text,
  witness_name text,
  witness_role text,
  destruction_method text,
  created_at timestamptz not null default now(),
  constraint destruction_book_return_by check (kind <> 'patient_return' or length(coalesce(returned_by_name, '')) >= 2)
);
create index if not exists destruction_book_open on destruction_book (pharmacy_id, received_date desc);
alter table destruction_book enable row level security;

create or replace function destruction_book_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'destruction book entries cannot be deleted'; end if;
  if old.destroyed_date is not null then raise exception 'this destruction is already recorded'; end if;
  -- only the destruction fields may be filled in
  if (new.kind, new.drug, new.schedule, new.quantity, new.unit, new.batch, new.expiry_date, new.returned_by_name, new.returned_by_address,
      new.received_date, new.received_by_staff_id, new.received_by_name, new.notes, new.pharmacy_id, new.created_at)
     is distinct from
     (old.kind, old.drug, old.schedule, old.quantity, old.unit, old.batch, old.expiry_date, old.returned_by_name, old.returned_by_address,
      old.received_date, old.received_by_staff_id, old.received_by_name, old.notes, old.pharmacy_id, old.created_at) then
    raise exception 'received details cannot be changed';
  end if;
  if new.destroyed_date is null or new.destroyed_by_staff_id is null then raise exception 'destruction date and person are required'; end if;
  return new;
end $$;
drop trigger if exists destruction_book_guard on destruction_book;
create trigger destruction_book_guard before update or delete on destruction_book for each row execute function destruction_book_guard();
