# Daggr Market Ingestion

Daggr uses Supabase Cron to invoke ingestion Edge Functions automatically.

## Current automated feeds

- GoDaddy Auctions: `recent_listings.json.zip` — daily at 16:00 UTC
- GoDaddy Auctions: `auctions_ending_today.json.zip` — daily at 16:30 UTC

The schedule is defined in:

`supabase/migrations/20260925161000_enable_market_ingestion_cron.sql`

Supabase recommends using `pg_cron` together with `pg_net` and storing the function authentication material in Vault when scheduling Edge Functions. See the official Supabase scheduling documentation.

## Required Vault secrets

The scheduled jobs expect these Vault secret names:

- `daggr_project_url`
- `daggr_publishable_key`

Do not commit their values to Git.

## Ingestion tracking

Each GoDaddy run creates an `ingestion_runs` record and records:

- received
- processed
- prepared
- imported
- skipped
- status
- start/completion time
- error information

Auction changes are additionally captured by the `auction_events` trigger.

## Important

A scheduled job being active does not mean the feed is healthy. Monitor:

1. Supabase Cron job history
2. `ingestion_runs`
3. `auctions`
4. `auction_events`

The connector must continue to be verified against the live GoDaddy Inventory Protocol before additional sources are treated as production feeds.
