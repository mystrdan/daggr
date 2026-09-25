# Daggr

**Domain market explorer.**

Daggr is being built as a discovery and market-intelligence terminal for the domain aftermarket.

## Current build

- Next.js dashboard
- Supabase domain-market schema
- Public read-only market tables protected by RLS
- Dynadot expired-auction connector
- GoDaddy Auctions Inventory connector
- Source registry for market providers
- Domain Pulse rail for curated or authorized industry updates
- Initial source documentation

## Data flow

provider → connector → normalized domain/auction data → Supabase → Daggr UI

Industry updates use a separate path:

authorized or curated source → market_updates → Domain Pulse

Daggr is discovery-first. Connectors do not place bids or purchase domains.

## Current sources

- GoDaddy Auctions
- Dynadot
- Namecheap Market (registered as a planned connector)
- Domain Name Wire (tracked for Domain Pulse; automated ingestion requires permission)
- DNJournal (tracked for sales/news research)
- ExpiredDomains.net (tracked as an aggregation/reference source)
- NamePros (tracked for community/marketplace research)
- Doma (tracked for on-chain domain-market research)

## Development

Create the required environment variables from .env.example, then run:

    npm install
    npm run dev

Do not commit provider API keys or Supabase service-role credentials.
