# Dynadot connector

First production connector target for Daggr.

Dynadot's `get_open_auctions` API can return in-progress auctions, including expired auctions, current bid price, bid count, end time, domain age and related domain signals.

Required configuration:
- DYNADOT_API_KEY

Suggested ingestion flow:
1. Request open expired auctions in pages.
2. Upsert source = Dynadot.
3. Normalize each domain into `domains`.
4. Upsert auction state into `auctions`.
5. Record changed observations in `auction_events`.
6. Mark previously live records as ended only when the source confirms they are no longer open; do not infer an ending from a missing page alone.

The connector must remain read-only. It must never place bids or purchase domains.

The same normalized model should support future sources such as GoDaddy inventory files.
