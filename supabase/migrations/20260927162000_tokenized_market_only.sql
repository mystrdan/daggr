create unique index if not exists auctions_source_external_unique on public.auctions(source_id, external_id) where external_id is not null;
update public.sources
set active = false
where name <> 'Doma';
update public.sources
set active = true,
    access_status = 'needs_credentials',
    credential_env = array['DOMA_API_KEY'],
    feed_types = array['tokenized_domains','onchain','marketplace','listings','offers'],
    docs_url = 'https://docs.doma.xyz/api-reference'
where name = 'Doma';
delete from public.auction_events
where auction_id in (
  select id from public.auctions
  where source_id = (select id from public.sources where name = 'GoDaddy Auctions')
);
delete from public.auctions
where source_id = (select id from public.sources where name = 'GoDaddy Auctions');