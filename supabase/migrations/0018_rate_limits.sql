-- 0018: attempt limits shared by every server (PIN unlock, sign-up, access code, scans, Halo feed).
-- Before this, each Vercel server counted on its own, so "5 PIN tries a minute" wasn't strict.
-- Keys are stored hashed (no IP addresses kept). Safe to re-run.
create table if not exists rate_limits (
  key_hash text primary key,
  hits integer not null,
  reset_at timestamptz not null
);
alter table rate_limits enable row level security; -- server only, no browser policies

-- add = 0 only reads the current count (used to check failed-PIN totals before trying).
create or replace function rate_limit_hit(k text, max_hits integer, window_seconds integer, add integer default 1)
returns table (ok boolean, retry_after integer)
language plpgsql security definer set search_path = public as $$
declare h text := encode(sha256(convert_to(k, 'UTF8')), 'hex'); r rate_limits;
begin
  insert into rate_limits as t (key_hash, hits, reset_at) values (h, add, now() + make_interval(secs => window_seconds))
  on conflict (key_hash) do update
    set hits = case when t.reset_at < now() then add else t.hits + add end,
        reset_at = case when t.reset_at < now() then now() + make_interval(secs => window_seconds) else t.reset_at end
  returning * into r;
  -- tidy a few expired rows as we go
  delete from rate_limits where key_hash in (select key_hash from rate_limits where reset_at < now() - interval '1 hour' limit 50);
  return query select r.hits <= max_hits and (add > 0 or r.hits < max_hits), greatest(0, ceil(extract(epoch from (r.reset_at - now())))::integer);
end $$;
revoke all on function rate_limit_hit(text, integer, integer, integer) from public, anon, authenticated;
