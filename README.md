# Aave Protocol Database

SQLite-based tracker for Aave lending protocol data. Tracks supply rates, borrow rates, TVL across chains.

## Setup

```bash
cd aave-db
npm install
```

## Daily Fetch

```bash
# Fetch all chains
npm run fetch

# Or specific chain
npm run fetch ethereum
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

## Database Schema

- **chains** - Supported networks (Ethereum, Polygon, etc.)
- **reserves** - Lending pools (USDC, USDT, WETH, etc.)
- **reserve_snapshots** - Daily rates and TVL data
- **rate_changes** - Computed 1d/7d/30d changes + alerts
- **sync_log** - Track fetch operations

## API Source

- **Aave v3 GraphQL**: `https://api.v3.aave.com/graphql`
- **Free**: No API key required
- **Rate limits**: None documented (be respectful)

## For Discord Bot Integration

```javascript
const { AaveDB } = require('./query.js');
const db = new AaveDB();

// Get top yields
const top = await db.getTopSupplyRates('ethereum', 100000, 5);

// Check alerts
const alerts = await db.getAlerts();

// Search token
const results = await db.search('USDC');

db.close();
```

## Cron Job

Add to OpenClaw for daily updates:
```
openclaw cron add --name aave:daily-update --cron "0 9 * * *" \
  --message "/exec node /workspace/aave-db/fetch-aave.js" \
  --announce
```
