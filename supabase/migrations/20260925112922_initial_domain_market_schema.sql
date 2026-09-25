create extension if not exists pgcrypto;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('auction','expired','sales','registry','other')),
  base_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tld text not null,
  normalized_name text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists domains_tld_idx on public.domains(tld);
create index if not exists domains_last_seen_idx on public.domains(last_seen_at desc);

create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  external_id text,
  status text not null check (status in ('upcoming','live','ended','cancelled','unknown')) default 'unknown',
  starts_at timestamptz,
  ends_at timestamptz,
  current_price numeric(18,2),
  currency text not null default 'USD',
  bid_count integer not null default 0 check (bid_count >= 0),
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, external_id)
);

create index if not exists auctions_status_ends_idx on public.auctions(status, ends_at);
create index if not exists auctions_price_idx on public.auctions(current_price desc nulls last);
create index if not exists auctions_domain_idx on public.auctions(domain_id);

create table if not exists public.auction_events (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  event_type text not null check (event_type in ('created','bid','price_change','status_change','extended','ended','cancelled','snapshot')),
  price numeric(18,2),
  bid_count integer,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists auction_events_auction_time_idx on public.auction_events(auction_id, occurred_at desc);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  external_id text,
  sale_price numeric(18,2),
  currency text not null default 'USD',
  sold_at timestamptz,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_id, external_id)
);

create index if not exists sales_sold_at_idx on public.sales(sold_at desc);
create index if not exists sales_price_idx on public.sales(sale_price desc nulls last);
create index if not exists sales_domain_idx on public.sales(domain_id);

alter table public.sources enable row level security;
alter table public.domains enable row level security;
alter table public.auctions enable row level security;
alter table public.auction_events enable row level security;
alter table public.sales enable row level security;

create policy "Public can read sources" on public.sources for select to anon, authenticated using (true);
create policy "Public can read domains" on public.domains for select to anon, authenticated using (true);
create policy "Public can read auctions" on public.auctions for select to anon, authenticated using (true);
create policy "Public can read auction events" on public.auction_events for select to anon, authenticated using (true);
create policy "Public can read sales" on public.sales for select to anon, authenticated using (true);

grant select on public.sources, public.domains, public.auctions, public.auction_events, public.sales to anon, authenticated;
