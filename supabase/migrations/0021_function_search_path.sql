-- 0021: pin search_path on every function in public that doesn't set one (Supabase security
-- advisor "function_search_path_mutable"). A fixed path means these functions (including the
-- append-only guards and fingerprint checks) can't be tricked into calling a look-alike object.
-- pg_catalog is always searched first, so built-ins (sha256, encode, ...) are unaffected. Safe to re-run.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- skip extension functions
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
