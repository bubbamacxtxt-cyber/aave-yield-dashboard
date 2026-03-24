# Aave Yield Dashboard

DeFi yield tracker for **Aave v3** and **Fluid** lending protocols. Tracks supply rates, borrow rates, TVL across 16+ chains.

**GitHub:** bubbamacxtxt-cyber/aave-yield-dashboard
**Live:** https://bubbamacxtxt-cyber.github.io/aave-yield-dashboard/

---

## What It Tracks

- **Aave v3**: 506 lending pools across 16 chains via GraphQL API
- **Fluid**: 32 lending pools across 6 chains via official API
- **Total**: 538 pools with supply/borrow rates and TVL

## Data Sources

| Protocol | API | Auth | Chains |
|----------|-----|------|--------|
| Aave v3 | `https://api.v3.aave.com/graphql` | None | 20+ chains |
| Fluid | `https://api.fluid.instadapp.io/v2/lending/{chainId}/tokens` | None | ETH, Polygon, Arbitrum, Base, BSC, Plasma |

## Setup

```bash
npm install
```

## Fetch Data

```bash
# Fetch Aave data
node fetch-aave.js

# Fetch Fluid data  
node fetch-fluid.js

# Export to JSON for dashboard
node export-data.js
```

## Query Data

```bash
# Top supply rates
node query.js top-supply

# Top supply on specific chain
node query.js top-supply polygon

# Lowest borrow rates
node query.js top-borrow

# Active alerts
node query.js alerts

# Chain overview
node query.js chain ethereum

# Search for token
node query.js search USDC

# Sync status
node query.js stats
```

## Database

SQLite database (`aave.db`) with schema:

- **reserves** — Lending pool details (token, chain, rates, TVL)
- **chains** — Supported networks
- **reserve_snapshots** — Historical rates and TVL data
- **sync_log** — Fetch operation tracking

## GitHub Actions

Automated data updates via `.github/workflows/update-data.yml`:
- Runs every 12 hours (staggered: Aave at 00:00, Fluid at 06:00 UTC)
- Fetches fresh data from both APIs
- Exports to JSON for dashboard
- Commits and pushes to GitHub

## Files

```
├── fetch-aave.js          # Aave v3 GraphQL fetcher
├── fetch-fluid.js         # Fluid REST API fetcher
├── export-data.js         # Export database to data.json
├── export-all.js          # Full export with all fields
├── query.js               # CLI query tool
├── schema.sql             # Database schema
├── dashboard-new.html     # Main dashboard
├── dashboard-local.html   # Local development version
├── dashboard-static.html  # Static export
├── index.html             # Landing page
├── tokens.html            # Token viewer
├── server.js              # Express dev server
└── aave.db                # SQLite database
```

## API Rate Limits

| API | Limit | Our Usage |
|-----|-------|-----------|
| Aave v3 GraphQL | None documented | ~50 queries per fetch |
| Fluid REST | None documented | 6 queries per fetch (one per chain) |

## Related Projects

- [Yield Portal](https://github.com/bubbamacxtxt-cyber/yield-portal) — Multi-protocol yield analytics via Portals API
- [Protocol Yield Tracker](https://github.com/bubbamacxtxt-cyber/protocol-yield-tracker) — Wallet position analyzer (Aave v3, Morpho)
