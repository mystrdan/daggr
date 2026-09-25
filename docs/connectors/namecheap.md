# Namecheap Market connector

Namecheap provides a dedicated Auctions API for its Market platform. It is separate from the normal Namecheap registrar API and requires a separate Market API key.

Daggr connector:
- Edge Function: ingest-namecheap-auctions
- Read/discovery only
- Does not place bids
- Uses NAMECHEAP_MARKET_API_KEY
- Optional NAMECHEAP_MARKET_API_URL override
- Default endpoint base: aftermarketapi.namecheap.com/client

Namecheap also documents an hourly CSV export of all current auctions. That export is a useful fallback or verification path if API access is unavailable.

Required secret:
NAMECHEAP_MARKET_API_KEY

No key is currently configured, so the connector is deployed but not yet live.

Official documentation is linked from the Daggr source map.

Last verified: 2026-09-25.
