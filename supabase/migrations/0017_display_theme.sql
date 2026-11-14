-- 0017: dashboard colour mode remembered on the pharmacy login (Default mint, Light, True Black, HSE Dark). Safe to re-run.
alter table pharmacy_accounts add column if not exists theme text;
do $$ begin
  alter table pharmacy_accounts add constraint pharmacy_accounts_theme check (theme is null or theme in ('default', 'light', 'dark', 'hse-dark'));
exception when duplicate_object then null; end $$;
