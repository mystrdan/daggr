create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  connector text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  filename text,
  received integer not null default 0,
  processed integer not null default 0,
  prepared integer not null default 0,
  imported integer not null default 0,
  skipped integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ingestion_runs_source_started_idx
  on public.ingestion_runs(source_id, started_at desc);

create index if not exists ingestion_runs_started_idx
  on public.ingestion_runs(started_at desc);

alter table public.ingestion_runs enable row level security;

create policy "Public can read ingestion runs"
  on public.ingestion_runs
  for select
  to anon, authenticated
  using (true);

grant select on public.ingestion_runs to anon, authenticated;
