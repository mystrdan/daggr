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
| Domain Name Wire | industry news | Website/feed; automation requires permission under its terms | **Tracked — permission required for automated ingestion** | Domain-industry pulse |
| DNJournal | domain sales/news | Public site; access/redistribution terms to verify | **Tracked — connector research next** | Sales/news context |
| ExpiredDomains.net | expired-domain aggregation | Public website; use as discovery/reference, not as an assumed raw feed | **Tracked — do not scrape by default** | Drop/expiry discovery context |
| NamePros | community / marketplace | Public community; integration/access terms to verify | **Tracked — connector research next** | Community and marketplace context |
| Doma | on-chain / tokenized domains | Official developer tooling / APIs | **Tracked — connector research next** | On-chain domain market intelligence |

## Domain Pulse

Daggr now has a small `market_updates` table for curated or authorized domain-industry updates.

The UI deliberately does not scrape news websites. A pulse item is only displayed after a permitted or curated source writes a record containing:
- title
- source
- source URL
- category
- publication time
- optional short excerpt

This keeps the main terminal focused on market data while allowing a compact industry-information rail.

Domain Name Wire currently publishes reporting across domain sales, policy, registrars, expired domains and new TLDs. Its terms state that automated programs must not access the site without express written permission and that republishing more than snippets from its RSS feed can violate its copyright terms. Daggr therefore should not build an automated scraper against it without permission.

## Rules

1. Never fabricate market records.
2. Never scrape a source merely because a webpage is public.
3. Record source attribution and source URLs where permitted.
4. Keep provider-specific raw payloads only where permitted and useful.
5. Do not expose provider credentials to the browser.
6. Keep acquisition/bidding/payment operations out of Daggr's discovery connectors unless explicitly designed and authorized.
7. Keep industry news separate from normalized auction/sales records unless the source represents an actual market transaction.
8. Do not automatically treat an aggregator such as ExpiredDomains.net as the primary source of an auction record.

## Connector shape

Each market source adapter normalizes into:
- source
- domain
- auction
- auction event
- sale

Industry-information adapters write to:
- market update
- source
- publication time
- source URL

Normalized records are stored in Supabase.
