# Daggr connector credentials

Daggr keeps provider credentials in the Supabase Edge Function environment, never in the browser or database.

## Credential slots

| Connector | Environment variable(s) | Access state |
|---|---|---|
| Dynadot | `DYNADOT_API_KEY` | Needs API key |
| Namecheap Market | `NAMECHEAP_MARKET_API_KEY` | Needs Market API key |
| Sedo | `SEDO_PARTNER_ID`, `SEDO_SIGN_KEY`, `SEDO_USERNAME`, `SEDO_PASSWORD` | Requires API access/relationship |
| GoDaddy Auctions | None for the public inventory feed currently used | Connected |

The code should treat a missing credential as a connector configuration state, not as an application crash.

Namecheap documents that its Auctions API requires a separate Market API key. Dynadot documents an API key for its auction API. Sedo documents partner/sign-key/account credentials for its API. These credentials should be supplied only through Supabase Edge Function secrets.

Do not put provider credentials in `NEXT_PUBLIC_*` variables, `sources.metadata`, or frontend code.

## Adding a connector

1. Verify the provider's current official API/feed documentation.
2. Add its credential names here and to the source registry metadata.
3. Implement a read-only connector first.
4. Record each run in `ingestion_runs`.
5. Normalize records into Daggr's market tables.
6. Verify the connector with real provider data before enabling a schedule.
