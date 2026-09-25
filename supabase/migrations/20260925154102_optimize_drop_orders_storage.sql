alter table public.drop_orders add column if not exists domain text;
update public.drop_orders d set domain = dom.name from public.domains dom where dom.id = d.domain_id and d.domain is null;
alter table public.drop_orders alter column domain set not null;
alter table public.drop_orders drop constraint if exists drop_orders_domain_id_registry_key;
alter table public.drop_orders add constraint drop_orders_domain_registry_key unique (domain, registry);
alter table public.drop_orders alter column domain_id drop not null;