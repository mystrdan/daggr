create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('daggr-godaddy-recent-daily')
where exists (
  select 1 from cron.job where jobname = 'daggr-godaddy-recent-daily'
);

select cron.unschedule('daggr-godaddy-ending-today-daily')
where exists (
  select 1 from cron.job where jobname = 'daggr-godaddy-ending-today-daily'
);

select cron.schedule(
  'daggr-godaddy-recent-daily',
  '0 16 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daggr_project_url') || '/functions/v1/ingest-godaddy-auctions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'daggr_publishable_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daggr_publishable_key')
      ),
      body := '{"filename":"recent_listings.json.zip","max_rows":5000}'::jsonb
    );
  $job$
);

select cron.schedule(
  'daggr-godaddy-ending-today-daily',
  '30 16 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daggr_project_url') || '/functions/v1/ingest-godaddy-auctions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'daggr_publishable_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daggr_publishable_key')
      ),
      body := '{"filename":"auctions_ending_today.json.zip","max_rows":5000}'::jsonb
    );
  $job$
);
