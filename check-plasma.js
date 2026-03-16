const { AaveDB } = require('./query');
const db = new AaveDB();

db.db.all(`
  SELECT r.symbol, c.name as chain, s.liquidity_rate as apy, s.price_in_usd as tvl
  FROM reserves r
  JOIN chains c ON r.chain_id = c.chain_id
  JOIN reserve_snapshots s ON r.id = s.reserve_id
  WHERE c.name = 'plasma' AND s.date = date('now') AND r.is_active = 1
  ORDER BY s.liquidity_rate DESC
  LIMIT 10
`, [], (err, rows) => {
  if(err) console.error(err);
  else {
    console.log('Plasma top yields:');
    rows.forEach(r => console.log(`  ${r.symbol}: ${(r.apy*100).toFixed(2)}% (TVL: $${(r.tvl/1e6).toFixed(2)}M)`));
  }
  db.close();
});
