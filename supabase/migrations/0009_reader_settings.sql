-- Document reader (OpenRouter) for the whole site, set by the site owner in Settings and
-- used by every pharmacy's scanning. The key is encrypted by the app (AES-256-GCM) before
-- it is stored; only a short hint is kept in clear. Server-only (RLS on, no policies).
create table if not exists site_secrets (
  id text primary key,                 -- 'reader'
  openrouter_key_enc text,
  openrouter_key_hint text,
  openrouter_models text,
  updated_at timestamptz not null default now()
);
alter table site_secrets enable row level security;
