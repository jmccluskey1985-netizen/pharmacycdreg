-- 0020: superintendent and support pharmacist roles; a superintendent's own login can open every
-- pharmacy they're superintendent for (switching pharmacies asks for that pharmacy's PIN). Safe to re-run.
alter type staff_role add value if not exists 'superintendent_pharmacist';
alter type staff_role add value if not exists 'support_pharmacist';

-- Extra pharmacies a login may open, besides its home pharmacy in pharmacy_accounts.
-- Added by that pharmacy's supervising/superintendent pharmacist (Team), tied to the staff record.
create table if not exists pharmacy_logins (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  added_by_staff_id uuid references staff(id),
  created_at timestamptz not null default now(),
  primary key (auth_user_id, pharmacy_id)
);
create index if not exists pharmacy_logins_pharmacy on pharmacy_logins (pharmacy_id);
alter table pharmacy_logins enable row level security; -- server only, no browser policies
