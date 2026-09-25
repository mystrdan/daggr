# Daggr data sources

Daggr is a domain market explorer. The data layer should use authorized or publicly available domain-market data and preserve source attribution.

## Initial source strategy

1. GoDaddy Auctions
   - Expiring-auction inventory is available as downloadable ZIP/XML/JSON inventory files.
   - The Auctions API also exposes auction resources, but access requirements vary by endpoint.
2. Dynadot
   - The API exposes open expired auctions with domain, current bid, bid count, end time and related fields.
3. Additional sources
   - Add only after verifying API/feed availability and redistribution terms.

## Important rule

Do not scrape or redistribute data merely because a webpage exposes it. Each connector must document its access method, rate limits, attribution requirements and permitted storage/display use.

## Connector shape

Each source adapter should normalize into:
- source
- domain
- auction
- auction event
- sale

The normalized records are stored in Supabase. Raw provider payloads belong in metadata when permitted and useful for audit/debugging.
