const { AaveDB } = require('./query');
const db = new AaveDB();

const chainsToCheck = ['plasma', 'optimism', 'mantle', 'linea', 'gnosis', 'celo', 'bsc', 'base', 'avalanche', 'arbitrum', 'ethereum'];

async function check() {
  for (const chain of chainsToCheck) {
    console.log(`\n=== ${chain.toUpperCase()} ===`);
    const rows = await db.getByChain(chain, 50);
    rows.forEach(r => {
      console.log(`  ${r.symbol}: ${(r.liquidity_rate*100).toFixed(2)}% supply, $${(r.tvl_usd/1e6).toFixed(2)}M TVL`);
    });
  }
  db.close();
}

check();
