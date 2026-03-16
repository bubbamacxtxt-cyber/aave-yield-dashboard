const { AaveDB } = require('./query');
const db = new AaveDB();

async function checkAll() {
  console.log('=== TOKEN VERIFICATION ===\n');
  
  const checks = [
    { chain: 'plasma', tokens: ['USDT0', 'USDe', 'sUSDe', 'syrupUSDT', 'PT-USDe', 'PT-sUSDE'] },
    { chain: 'optimism', tokens: ['USDC', 'USDC.e', 'LUSD'] },
    { chain: 'mantle', tokens: ['sUSDe', 'syrupUSDT', 'USDe', 'USDC', 'GHO', 'USDT0'] },
    { chain: 'linea', tokens: ['USDT', 'mUSD'] },
    { chain: 'gnosis', tokens: ['sDAI'] },
    { chain: 'celo', tokens: ['USDT', 'USDm'] },
    { chain: 'bsc', tokens: ['FDUSD'] },
    { chain: 'base', tokens: ['syrupUSDC', 'USDbC'] },
    { chain: 'avalanche', tokens: ['DAI.e', 'sUSD.e', 'FRAX', 'USDC', 'USDe'] },
    { chain: 'arbitrum', tokens: ['USDT0', 'USDT.e', 'GHO', 'USDC.e', 'FRAX', 'LUSD'] },
    { chain: 'ethereum', tokens: ['sUSDe', 'syrupUSDT', 'PT-USDe', 'PT-sUSDE', 'sDAI', 'LUSD', 'USDe'] }
  ];
  
  for (const check of checks) {
    console.log(`\n${check.chain.toUpperCase()}:`);
    const rows = await db.getByChain(check.chain, 100);
    for (const token of check.tokens) {
      const found = rows.filter(r => r.symbol.includes(token) || r.symbol.includes(token.replace('.e', '')));
      if (found.length > 0) {
        found.forEach(f => console.log(`  ✅ ${f.symbol}: ${(f.liquidity_rate*100).toFixed(2)}%`));
      } else {
        console.log(`  ❌ ${token}: NOT FOUND`);
      }
    }
  }
  
  // Check Ethereum markets
  console.log('\n\nETHEREUM MARKETS:');
  const ethRows = await db.db.all(`
    SELECT DISTINCT market FROM reserves 
    WHERE chain_id = 1 AND market IS NOT NULL
  `);
  ethRows.forEach(r => console.log(`  ${r.market}`));
  
  db.close();
}

checkAll();
