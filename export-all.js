const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('aave.db');
const fs = require('fs');

const today = new Date('2026-03-16');

// Parse date from PT ticker like PT-USDe-15JAN2026
function parsePTDate(symbol) {
  const match = symbol.match(/-(\d{1,2})([A-Z]{3})(\d{4})$/);
  if (!match) return null;
  
  const day = match[1];
  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const month = monthNames.indexOf(match[2]);
  const year = match[3];
  
  if (month === -1) return null;
  return new Date(year, month, day);
}

// Check if token is an expired PT
function isExpiredPT(symbol) {
  if (!symbol.startsWith('PT-')) return false;
  const expiry = parsePTDate(symbol);
  if (!expiry) return false;
  return expiry < today;
}

db.all(`SELECT MAX(date) as latest_date FROM reserve_snapshots`, [], (err, rows) => {
  console.log('Date rows:', rows);
  const dateRow = rows && rows[0];
  const latestDate = dateRow?.latest_date || 'now';
  console.log('Using date:', latestDate);
  
  db.all(`
    SELECT r.symbol, c.name as chain, r.app, r.market,
           s.liquidity_rate as supply_rate, s.variable_borrow_rate as borrow_rate,
           s.price_in_usd as tvl_usd,
           ch.supply_rate_change_1d, ch.supply_rate_change_7d
    FROM reserves r
    JOIN chains c ON r.chain_id = c.chain_id
    JOIN reserve_snapshots s ON r.id = s.reserve_id
    LEFT JOIN rate_changes ch ON r.id = ch.reserve_id
    WHERE s.date = '${latestDate}' AND r.is_active = 1
    ORDER BY c.name, r.symbol
  `, [], (err, rows) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }
    
    // Filter out expired PTs and deduplicate
    const seen = new Set();
    const unique = [];
    let expiredCount = 0;
    
    for (const r of rows) {
      // Skip expired PT tokens
      if (isExpiredPT(r.symbol)) {
        expiredCount++;
        continue;
      }
      
      // For Ethereum, include market in key to show all markets
      const key = r.chain === 'ethereum' 
        ? r.symbol + '_' + r.chain + '_' + (r.market || 'Core') + '_' + (r.app || 'Aave')
        : r.symbol + '_' + r.chain + '_' + (r.app || 'Aave');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }
    
    console.log('Filtered out ' + expiredCount + ' expired PT tokens');
    
    // Get last sync
    db.get(`SELECT * FROM sync_log WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1`, [], (err, lastSync) => {
      const data = {
        topSupply: unique,
        topBorrow: unique.filter(r => r.borrow_rate > 0).sort((a,b) => a.borrow_rate - b.borrow_rate),
        lastSync,
        generatedAt: new Date().toISOString(),
        source: 'sqlite'
      };
      
      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
      console.log('✅ Exported ' + unique.length + ' unique reserves (active only)');
      db.close();
    });
  });
});
