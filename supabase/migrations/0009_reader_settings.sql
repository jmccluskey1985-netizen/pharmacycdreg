-- Document reader (OpenRouter) per pharmacy, set in Settings. The key is encrypted by the
-- app (AES-256-GCM) before it is stored; only a short hint is kept in clear. Server-only.
create table if not exists pharmacy_secrets (
  pharmacy_id uuid primary key references pharmacies(id) on delete cascade,
  openrouter_key_enc text,
  openrouter_key_hint text,
  openrouter_models text,
  updated_at timestamptz not null default now()
);
alter table pharmacy_secrets enable row level security;
