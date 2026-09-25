alter table public.sources
  add column if not exists access_status text not null default 'researching'
    check (access_status in ('connected','ready','needs_credentials','needs_approval','researching','disabled')),
  add column if not exists credential_env text[] not null default '{}'::text[],
  add column if not exists feed_types text[] not null default '{}'::text[],
  add column if not exists docs_url text;

update public.sources set
  access_status='connected',
  credential_env='{}',
  feed_types=array['auctions','expiring','closeouts'],
  docs_url='https://www.godaddy.com/domains/auctions'
where name='GoDaddy Auctions';

update public.sources set
  access_status='needs_credentials',
  credential_env=array['DYNADOT_API_KEY'],
  feed_types=array['auctions','expired','backorders','registry_expired'],
  docs_url='https://www.dynadot.com/domain/api-commands'
where name='Dynadot';

update public.sources set
  access_status='needs_credentials',
  credential_env=array['NAMECHEAP_MARKET_API_KEY'],
  feed_types=array['auctions','sales'],
  docs_url='https://aftermarketapi.namecheap.com/client/docs/'
where name='Namecheap Market';

update public.sources set
  access_status='needs_approval',
  credential_env=array['SEDO_PARTNER_ID','SEDO_SIGN_KEY','SEDO_USERNAME','SEDO_PASSWORD'],
  feed_types=array['listings','domain_search'],
  docs_url='https://api.sedo.com/apidocs/v1/'
where name='Sedo';

update public.sources set
  access_status='researching',
  credential_env='{}',
  feed_types=array['sales','news'],
  docs_url='https://www.dnjournal.com/'
where name='DNJournal';

update public.sources set
  access_status='needs_approval',
  credential_env='{}',
  feed_types=array['news','sales','market'],
  docs_url='https://domainnamewire.com/'
where name='Domain Name Wire';
