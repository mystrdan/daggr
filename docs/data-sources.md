# Daggr data sources

Daggr is a domain market explorer. The data layer uses official APIs, feeds, inventory exports, or other authorized/publicly available market data. Each source is documented before it is connected.

## Source map

| Source | Type | Access | Status | Daggr use |
|---|---|---|---|---|
| GoDaddy Auctions | auction / expiry | Official Inventory Protocol; Auctions API for authenticated operations | **Connected** | Live expired auctions, closeouts, market discovery |
| Dynadot | auction / expiry | Official API | **Connected** | Open expired auctions |
| Namecheap Market | auction | Official Auctions API | Connected | Active auction discovery |
| NameBio | sales intelligence | Official API / datasets | Review licensing before commercial integration | Historical sales/comps |
| Sedo | marketplace / sales | Official API | Review access/terms | Marketplace discovery |
| TLD-List | pricing / TLD intelligence | Official API | Secondary | TLD/registrar pricing context |
| GoDaddy Domains API | registrar | Official API | Secondary | Domain/registrar enrichment |
| Namecheap API | registrar | Official API | Secondary | Domain/TLD enrichment |

## GoDaddy

GoDaddy's official documentation says Auctions Inventory Files are downloadable ZIP/XML/JSON datasets containing bulk information on live expired auctions and closeout listings. The current inventory index exposes files such as `all_expiring_auctions.json.zip`, `all_biddable_auctions.json.zip`, `closeout_listings.json.zip`, and smaller recent/ending feeds.

Daggr's connector uses the Inventory Protocol for read-only discovery. The authenticated Auctions API is deliberately not used for bidding or purchasing.

## Dynadot

Dynadot's official API provides open expired auctions with domain, bid, bid count, end-time and related fields. Daggr normalizes these into `domains`, `auctions`, and eventually `auction_events`.

## Namecheap Market

Namecheap documents a dedicated Auctions API, separate from its normal registrar API. Market API access requires onboarding and its own API key. Daggr will use it only for read/discovery operations.

## Sales intelligence

NameBio and Sedo can provide valuable historical/comparable sales information, but access and redistribution terms must be checked before displaying provider data as Daggr product data.

## Rules

1. Never fabricate market records.
2. Never scrape a source merely because a webpage is public.
3. Record source attribution and source URLs where permitted.
4. Keep provider-specific raw payloads only where permitted and useful.
5. Do not expose provider credentials to the browser.
6. Keep acquisition/bidding/payment operations out of Daggr's discovery connectors unless explicitly designed and authorized.

## Connector shape

Each source adapter normalizes into:
- source
- domain
- auction
- auction event
- sale

Normalized records are stored in Supabase.


## Doma Protocol

Doma is also a Daggr source, but it belongs in a separate **on-chain / tokenized domain market** category rather than being treated like a conventional registrar auction feed. Doma provides a standardized bridge between traditional domain registrars and blockchain infrastructure, with tokenized domains represented on Doma Chain. Its marketplace ecosystem exposes listed names and market activity, and Doma provides developer APIs and tooling for domain data.

For Daggr, Doma should initially be treated as a **marketplace / on-chain intelligence source**. We should ingest public market/listing data only after confirming the current API endpoints and permitted use for aggregation. We should not mix Doma records into registrar-auction statistics without marking their source and market type.

Status: **Tracked — connector research next.**
