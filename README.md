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
- Initial source documentation

## Data flow

`provider → connector → normalized domain/auction data → Supabase → Daggr UI`

Daggr is discovery-first. Connectors do not place bids or purchase domains.

## Current sources

- GoDaddy Auctions
- Dynadot
- Namecheap Market (registered as a planned connector)

## Development

Create the required environment variables from `.env.example`, then run:

```bash
npm install
npm run dev
```

Do not commit provider API keys or Supabase service-role credentials.
