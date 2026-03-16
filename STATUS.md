# AAVE Database - Status Report

## Current State

### Data
- **Last Sync**: March 16, 2026 13:58 UTC (fresh)
- **Total Reserves**: 174 across 6 chains
- **Chains**: Ethereum, Polygon, Avalanche, Arbitrum, Optimism, Base
- **Data Quality**: Fixed TVL calculations (was showing quadrillions, now accurate)

### Top Stablecoin Supply Rates
| Rank | Asset | Chain | APY |
|------|-------|-------|-----|
| 1 | AUSD | Avalanche | 9.55% |
| 2 | USDG | Ethereum | 4.56% |
| 3 | GHO | Avalanche | 3.98% |
| 4 | DAI | Polygon | 3.32% |
| 5 | crvUSD | Ethereum | 3.27% |
| 6 | USDC | Polygon | 3.24% |
| 7 | USDC | Base | 2.54% |
| 8 | USDT0 | Polygon | 2.31% |
| 9 | USDS | Ethereum | 2.09% |
| 10 | USDC | Avalanche | 2.09% |

### Ethereum TVL Leaders
1. USDT: $5.25B
2. WBTC: $3.07B
3. cbBTC: $1.92B
4. USDe: $1.07B
5. osETH: $364M

## Files

| File | Purpose |
|------|---------|
| `fetch-aave.js` | Pulls data from Aave v3 GraphQL API |
| `query.js` | CLI tool + AaveDB class for queries |
| `schema.sql` | Database schema |
| `aave.db` | SQLite database (577KB) |
| `dashboard.html` | Old dashboard (uses external API) |
| `dashboard-new.html` | New dashboard (reads from local DB via API) |
| `server.js` | Express server for new dashboard |

## Automation

**Cron Job**: `aave-fetch-12h`  
- Runs every 12 hours
- Fetches fresh data for all 6 chains
- Reports success/failure

## How to Use

### View Data (CLI)
```bash
node query.js top-supply          # Top 10 supply rates
node query.js top-borrow          # Lowest borrow rates
node query.js chain ethereum      # Ethereum reserves
node query.js search USDC         # Search by symbol
node query.js alerts              # Show rate/TVL alerts
node query.js stats               # Last sync info
```

### View Dashboard
```bash
# Option 1: With server (better)
node server.js
# Open http://localhost:3456/dashboard-new.html

# Option 2: Static (old)
open dashboard.html
```

### Manual Fetch
```bash
node fetch-aave.js              # All chains
node fetch-aave.js ethereum     # Single chain
```

## Known Issues & Fixes Applied

1. **TVL Calculation Bug**: Fixed — was multiplying total_supplied by price_in_usd and dividing by 1e18. Now correctly uses price_in_usd as the TVL value (it stores the USD total directly from API).

2. **Dashboard**: Old dashboard uses external API that may be unreliable. New dashboard reads from local DB.

## Next Steps (Per Your Direction)

1. ✅ Aave working properly — DONE
2. ✅ All chains covered — DONE  
3. ✅ All tokens captured — DONE
4. ✅ Clean data — DONE (TVL fix)
5. ✅ 12-hour cron — DONE
6. ⏳ Build redundancy — Could add backup data source
7. ⏳ Dashboard looking good — New dashboard created, needs review
8. ⏳ Query bot — Discord/Telegram bot for queries

## When Ready for Next Protocol

Next: **Morpho** or **Fluid**
- Similar schema structure
- Same 6 chains
- Lending focus first
- 12-hour updates

---
*Updated: March 16, 2026*
