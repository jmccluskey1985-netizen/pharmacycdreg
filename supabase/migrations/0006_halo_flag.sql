-- Halo (dispensing-system link) is switched on per pharmacy. Off for everyone by default.
alter table pharmacies add column if not exists halo_enabled boolean not null default false;
