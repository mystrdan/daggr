# GoDaddy Auctions connector

## Access method

Daggr uses the official GoDaddy Auctions Inventory Protocol for broad discovery. GoDaddy publishes daily ZIP archives containing JSON, XML, and CSV inventory; the inventory endpoint is publicly reachable and is intended for bulk analysis. The official Auctions API is separate and uses a Classic Developer Key for authenticated listing operations.

## Daggr ingestion

Edge Function: `ingest-godaddy-auctions`

Default archive:
- `recent_listings.json.zip`

Supported archives include:
- `recent_listings.json.zip`
- `all_expiring_auctions.json.zip`
- `expiring_auctions_non_adult.json.zip`
- `all_biddable_auctions.json.zip`
- `closeout_listings.json.zip`
- `auctions_ending_today.json.zip`
- `auctions_ending_tomorrow.json.zip`

The function accepts a `max_rows` limit so ingestion can be bounded. It downloads the official ZIP, unwraps the JSON payload, normalizes provider field variants, then upserts domains and auctions in batches. The raw provider listing is retained in `metadata` for audit/debugging. Auction changes are captured by Daggr's database trigger as `auction_events`.

## Important distinction

This connector is discovery/read-only. It does not place bids or purchase domains.

GoDaddy's authenticated Auctions API currently requires a Classic Developer Key; Personal Access Tokens are not supported for those Auctions API endpoints.

## Source

- Inventory: https://inventory.auctions.godaddy.com/
- Auctions developer documentation: https://developer.godaddy.com/en/docs/api-users/auctions

On 2026-09-25, the official inventory index listed the supported JSON archives above, including `all_expiring_auctions.json.zip`, `all_biddable_auctions.json.zip`, `closeout_listings.json.zip`, `auctions_ending_today.json.zip`, and `auctions_ending_tomorrow.json.zip`. The connector remains read-only and does not assume that a downloaded inventory file represents every GoDaddy listing.

Last verified: 2026-09-25.
