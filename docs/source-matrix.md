# Daggr Source Matrix

Daggr is a domain-market explorer, so its data layer is intentionally multi-source. A source does not have to be connected before the next source is researched or implemented.

## Market sources

| Source | Primary role | Feed types | Current status | Next action |
|---|---|---|---|---|
| GoDaddy Auctions | Auctions / expiring | auctions, expiring, closeouts | connected | Validate real ingestion |
| Dynadot | Auctions / expired | auctions, expired, backorders, registry_expired | needs_credentials | Supply API key, test connector |
| Namecheap Market | Auctions / sales | auctions, sales | needs_credentials | Supply Market API key, test connector |
| NameBio | Sales intelligence | sales, analytics, drop_order | ready | Build permitted sales/analytics ingestion where access allows |
| ExpiredDomains.net | Expiring / deleted | expired, deleted, drop | researching | No public API; do not automate against member area |
| Doma | Domain marketplace / onchain | marketplace, onchain, sales, activity | researching | Identify authorized/public data interface |
| DropCatch | Auctions / expired | auctions, expired, backorders | researching | Research authorized feed/API |
| NameJet | Auctions / expired | auctions, expired, backorders | researching | Research authorized feed/API |
| SnapNames | Auctions / expired | auctions, expired, backorders | researching | Research authorized feed/API |
| Sedo | Marketplace / auctions | auctions, marketplace, sales | researching | Research authorized feed/API |
| Afternic | Marketplace / sales | marketplace, sales | researching | Research authorized feed/API |

## News and market intelligence

| Source | Feed types | Current status |
|---|---|---|
| DNJournal | sales, news | researching |
| Domain Name Wire | news, sales, market | needs_approval |
| Domain Incite | news, market | researching |
| The Domains | news, sales, market | researching |
| GoDaddy Auctions News | news, market | researching |

## Registry / drop intelligence

| Source | Feed types | Current status |
|---|---|---|
| Verisign Drop Order | drop_order, registry | ready |

## Connector rules

1. Never create fake market records to make the UI look populated.
2. Research and build connectors independently; one blocked source must not block the others.
3. `connected` means Daggr has a working ingestion path, not merely a source record.
4. `ready` means the access method is known and implementation can proceed without a missing credential or approval.
5. `needs_credentials` means the connector can be built/tested once the required credential is configured.
6. `needs_approval` means access depends on permission from the provider.
7. `researching` means the source is identified but Daggr has not established an authorized ingestion path yet.
8. Public pages may be used for attribution and research, but Daggr must not bypass authentication, anti-bot controls, rate limits, or provider restrictions.

## Priority

The implementation is parallel rather than sequential:

- Keep GoDaddy ingestion moving.
- Test Dynadot and Namecheap when credentials are available.
- Build the NameBio/Verisign integrations that are explicitly available to products.
- Research Doma as a separate marketplace/onchain source.
- Research auction platforms and news sources independently.
- Update the source status as evidence changes.

This keeps Daggr moving even when one provider is blocked.