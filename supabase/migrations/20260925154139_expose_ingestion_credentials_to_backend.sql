create table if not exists public.ingestion_credentials (
  name text primary key,
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.ingestion_credentials enable row level security;
revoke all on public.ingestion_credentials from anon, authenticated;
grant select on public.ingestion_credentials to service_role;