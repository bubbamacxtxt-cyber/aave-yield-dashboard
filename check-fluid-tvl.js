const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('aave.db');

console.log('=== FLUID TVL CHECK ===');
db.all(`
  SELECT r.symbol, c.name as chain, s.price_in_usd as tvl, s.liquidity_rate 
  FROM reserves r 
  JOIN chains c ON r.chain_id = c.chain_id 
  JOIN reserve_snapshots s ON r.id = s.reserve_id 
  WHERE r.app = 'Fluid' 
  ORDER BY c.name, r.symbol
`, [], (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  rows.forEach(r => {
    const tvlFormatted = r.tvl >= 1e9 ? (r.tvl/1e9).toFixed(2) + 'B' : 
                        r.tvl >= 1e6 ? (r.tvl/1e6).toFixed(2) + 'M' : 
                        r.tvl >= 1e3 ? (r.tvl/1e3).toFixed(2) + 'K' : 
                        r.tvl.toFixed(2);
    console.log('  ' + r.chain + ':' + r.symbol + ' | TVL: ' + tvlFormatted + ' | APY: ' + (r.liquidity_rate*100).toFixed(2) + '%');
  });
  
  console.log('\nRaw TVL values (checking for precision issues):');
  rows.slice(0, 5).forEach(r => {
    console.log('  ' + r.symbol + ': ' + r.tvl + ' (raw)');
  });
  
  db.close();
});
