-- 0013: tamper-evident register and audit trail, inspector links, "require 2FA" setting.
-- Safe to re-run.

-- ───────────────────────── 1. Hash chains ─────────────────────────
-- Every register line carries a SHA-256 fingerprint of its own contents plus the previous
-- line's fingerprint. Changing or removing any earlier line (even directly in the database)
-- breaks every fingerprint after it, so "Verify integrity" shows exactly where. The audit
-- trail is chained the same way, per pharmacy. Fixed field lists (not to_jsonb) so adding
-- columns later never changes the fingerprint of existing rows.

alter table cd_entries add column if not exists prev_hash text;
alter table cd_entries add column if not exists row_hash text;
alter table audit_log add column if not exists chain_seq bigint;
alter table audit_log add column if not exists prev_hash text;
alter table audit_log add column if not exists row_hash text;
create index if not exists audit_log_chain on audit_log (pharmacy_id, chain_seq);

create or replace function cd_entry_fingerprint(e cd_entries, prev text) returns text
language sql stable set timezone = 'UTC' as $$
  select encode(sha256(convert_to(coalesce(prev, 'GENESIS') || '|' || jsonb_build_object(
    'id', e.id, 'register_id', e.register_id, 'seq', e.seq, 'entry_type', e.entry_type::text,
    'transaction_date', e.transaction_date, 'recorded_at', e.recorded_at, 'quantity', e.quantity,
    'supplier_name', e.supplier_name, 'supplier_address', e.supplier_address,
    'recipient_name', e.recipient_name, 'recipient_address', e.recipient_address,
    'prescriber_name', e.prescriber_name, 'prescriber_address', e.prescriber_address,
    'authority_to_possess', e.authority_to_possess, 'prescription_ref', e.prescription_ref,
    'collected_by', e.collected_by, 'collector_id_checked', e.collector_id_checked,
    'witness_name', e.witness_name, 'witness_role', e.witness_role, 'destruction_method', e.destruction_method,
    'corrects_entry_id', e.corrects_entry_id, 'correction_reason', e.correction_reason, 'notes', e.notes,
    'source', e.source, 'recorded_by_staff_id', e.recorded_by_staff_id, 'recorded_by_auth_user', e.recorded_by_auth_user
  )::text, 'UTF8')), 'hex')
$$;

create or replace function audit_fingerprint(a audit_log, prev text) returns text
language sql stable set timezone = 'UTC' as $$
  select encode(sha256(convert_to(coalesce(prev, 'GENESIS') || '|' || jsonb_build_object(
    'id', a.id, 'pharmacy_id', a.pharmacy_id, 'chain_seq', a.chain_seq, 'occurred_at', a.occurred_at,
    'action', a.action, 'staff_id', a.staff_id, 'staff_name', a.staff_name, 'auth_user_id', a.auth_user_id,
    'target_table', a.target_table, 'target_id', a.target_id, 'details', a.details
  )::text, 'UTF8')), 'hex')
$$;

-- Runs after cd_entries_bi (alphabetical), which has already locked the register and set seq.
create or replace function cd_entries_hash() returns trigger language plpgsql set timezone = 'UTC' as $$
begin
  select row_hash into new.prev_hash from cd_entries where register_id = new.register_id and seq = new.seq - 1;
  new.row_hash := cd_entry_fingerprint(new, new.prev_hash);
  return new;
end $$;
drop trigger if exists cd_entries_zz_hash on cd_entries;
create trigger cd_entries_zz_hash before insert on cd_entries for each row execute function cd_entries_hash();

create or replace function audit_log_hash() returns trigger language plpgsql set timezone = 'UTC' as $$
begin
  -- one writer per pharmacy chain at a time
  perform pg_advisory_xact_lock(hashtextextended('audit:' || coalesce(new.pharmacy_id::text, '-'), 0));
  select chain_seq, row_hash into new.chain_seq, new.prev_hash from audit_log
    where pharmacy_id is not distinct from new.pharmacy_id and chain_seq is not null
    order by chain_seq desc limit 1;
  new.chain_seq := coalesce(new.chain_seq, 0) + 1;
  new.row_hash := audit_fingerprint(new, new.prev_hash);
  return new;
end $$;
drop trigger if exists audit_log_zz_hash on audit_log;
create trigger audit_log_zz_hash before insert on audit_log for each row execute function audit_log_hash();

-- Backfill existing rows once, in order (the append-only guards are paused for this only).
do $$
declare e cd_entries; a audit_log; prev text; cur uuid; seqn bigint; curph text;
begin
  if exists (select 1 from cd_entries where row_hash is null) then
    alter table cd_entries disable trigger cd_entries_no_update;
    cur := null;
    for e in select * from cd_entries order by register_id, seq loop
      if cur is distinct from e.register_id then prev := null; cur := e.register_id; end if;
      update cd_entries set prev_hash = prev, row_hash = cd_entry_fingerprint(e, prev) where id = e.id returning row_hash into prev;
    end loop;
    alter table cd_entries enable trigger cd_entries_no_update;
  end if;
  if exists (select 1 from audit_log where row_hash is null) then
    alter table audit_log disable trigger audit_log_no_update;
    curph := '#';
    for a in select * from audit_log order by pharmacy_id nulls first, id loop
      if curph is distinct from coalesce(a.pharmacy_id::text, '-') then prev := null; seqn := 0; curph := coalesce(a.pharmacy_id::text, '-'); end if;
      seqn := seqn + 1;
      a.chain_seq := seqn;
      update audit_log set chain_seq = seqn, prev_hash = prev, row_hash = audit_fingerprint(a, prev) where id = a.id returning row_hash into prev;
    end loop;
    alter table audit_log enable trigger audit_log_no_update;
  end if;
end $$;

-- Walk a register's chain. ok=false names the first line that doesn't match.
create or replace function verify_register_chain(reg uuid)
returns table (ok boolean, checked integer, broken_seq bigint, reason text, head text)
language plpgsql stable set timezone = 'UTC' as $$
declare e cd_entries; prev text := null; n integer := 0; expect bigint := 1;
begin
  for e in select * from cd_entries where register_id = reg order by seq loop
    n := n + 1;
    if e.seq <> expect then return query select false, n, e.seq, format('line %s is missing', expect), prev; return; end if;
    if e.prev_hash is distinct from prev then return query select false, n, e.seq, 'link to the previous line does not match', prev; return; end if;
    if e.row_hash is distinct from cd_entry_fingerprint(e, prev) then return query select false, n, e.seq, 'line contents changed after it was written', prev; return; end if;
    prev := e.row_hash; expect := expect + 1;
  end loop;
  return query select true, n, null::bigint, null::text, prev;
end $$;

create or replace function verify_audit_chain(ph uuid)
returns table (ok boolean, checked integer, broken_seq bigint, reason text, head text)
language plpgsql stable set timezone = 'UTC' as $$
declare a audit_log; prev text := null; n integer := 0; expect bigint := 1;
begin
  for a in select * from audit_log where pharmacy_id = ph order by chain_seq loop
    n := n + 1;
    if a.chain_seq is distinct from expect then return query select false, n, a.chain_seq, format('audit record %s is missing', expect), prev; return; end if;
    if a.prev_hash is distinct from prev then return query select false, n, a.chain_seq, 'link to the previous record does not match', prev; return; end if;
    if a.row_hash is distinct from audit_fingerprint(a, prev) then return query select false, n, a.chain_seq, 'record changed after it was written', prev; return; end if;
    prev := a.row_hash; expect := expect + 1;
  end loop;
  return query select true, n, null::bigint, null::text, prev;
end $$;
revoke all on function verify_register_chain(uuid) from public;
revoke all on function verify_audit_chain(uuid) from public;

-- ───────────────────────── 2. Inspector access links ─────────────────────────
-- A time-limited, read-only link for a PSI inspector / authorised officer. Only a hash of
-- the token is stored; the link itself is shown once to the supervising pharmacist.
create table if not exists inspector_links (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  token_hash text not null unique,
  label text not null,
  expires_at timestamptz not null,
  created_by_staff_id uuid references staff(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0
);
create index if not exists inspector_links_pharmacy on inspector_links (pharmacy_id, created_at desc);
alter table inspector_links enable row level security;

-- ───────────────────────── 3. Require two-step sign-in ─────────────────────────
alter table pharmacies add column if not exists require_2fa boolean not null default false;
