-- 0014: read documents with Google Vertex AI in the EU (one Google Cloud Data Processing
-- Addendum; processing stays in the EU) instead of, or as well as, OpenRouter.
-- The service-account key is encrypted by the app (AES-256-GCM) before it's stored.
alter table site_secrets add column if not exists reader_provider text not null default 'openrouter'
  check (reader_provider in ('openrouter', 'vertex'));
alter table site_secrets add column if not exists vertex_sa_enc text;          -- encrypted service-account JSON
alter table site_secrets add column if not exists vertex_client_email text;    -- shown as a hint
alter table site_secrets add column if not exists vertex_project text;
alter table site_secrets add column if not exists vertex_location text not null default 'eu';
