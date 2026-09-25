create table if not exists public.drop_orders (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid references public.domains(id) on delete cascade,
  domain text not null,
  source_id uuid references public.sources(id) on delete set null,
  registry text not null,
  expires_on timestamptz,
  drop_order bigint,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (domain, registry)
);
alter table public.drop_orders enable row level security;
create policy "Public can read drop orders" on public.drop_orders for select to anon, authenticated using (true);
grant select on public.drop_orders to anon, authenticated;
create index if not exists drop_orders_registry_order_idx on public.drop_orders(registry, drop_order);
create index if not exists drop_orders_expires_idx on public.drop_orders(expires_on);
create index if not exists drop_orders_domain_idx on public.drop_orders(domain);