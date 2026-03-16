const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('aave.db');

// Check Optimism USDC contracts
console.log('=== OPTIMISM USDC CHECK ===');
db.all(`
  SELECT r.symbol, r.underlying_asset, c.name as chain, s.liquidity_rate
  FROM reserves r
  JOIN chains c ON r.chain_id = c.chain_id
  JOIN reserve_snapshots s ON r.id = s.reserve_id
  WHERE c.name = 'optimism' AND (r.symbol = 'USDC' OR r.symbol LIKE '%USDC%')
  AND s.date = date('now')
`, [], (err, rows) => {
  if (err) console.error(err);
  else rows.forEach(r => console.log(`  ${r.symbol}: ${r.underlying_asset} @ ${(r.liquidity_rate*100).toFixed(2)}%`));
  
  // Check Ethereum markets
  console.log('\n=== ETHEREUM MARKETS CHECK ===');
  db.all(`
    SELECT r.id, r.symbol, r.underlying_asset, s.liquidity_rate
    FROM reserves r
    JOIN reserve_snapshots s ON r.id = s.reserve_id
    WHERE r.id LIKE 'ethereum_%' AND r.symbol IN ('USDC', 'USDT', 'DAI')
    AND s.date = date('now')
    ORDER BY r.symbol
  `, [], (err, rows) => {
    if (err) console.error(err);
    else rows.forEach(r => console.log(`  ${r.id}: ${r.symbol} @ ${(r.liquidity_rate*100).toFixed(2)}%`));
    db.close();
  });
});
