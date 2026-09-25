create schema if not exists private;
create table if not exists private.ingestion_credentials (
  name text primary key,
  token text not null,
  created_at timestamptz not null default now()
);