create table if not exists public.market_updates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  title text not null,
  url text not null unique,
  category text not null default 'news' check (category in ('news','sales','policy','registry','market')),
  excerpt text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists market_updates_published_at_idx on public.market_updates (published_at desc);

alter table public.market_updates enable row level security;

create policy "market_updates_public_read" on public.market_updates
  for select to anon, authenticated using (true);
