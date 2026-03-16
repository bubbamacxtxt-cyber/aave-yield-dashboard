const { AaveDB } = require('./query');
const fs = require('fs');

const db = new AaveDB();

Promise.all([
  db.getTopSupplyRates(null, 0, 300),
  db.getTopBorrowRates(null, 100),
  db.getLastSync()
]).then(([topSupply, topBorrow, lastSync]) => {
  // Deduplicate by symbol+chain - keep first occurrence (highest APY)
  const seen = new Set();
  const uniqueSupply = [];
  for (const r of topSupply) {
    const key = r.symbol + '_' + r.chain;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSupply.push(r);
    }
  }
  
  const seenBorrow = new Set();
  const uniqueBorrow = [];
  for (const r of topBorrow) {
    const key = r.symbol + '_' + r.chain;
    if (!seenBorrow.has(key)) {
      seenBorrow.add(key);
      uniqueBorrow.push(r);
    }
  }
  
  // Add app field
  const supplyWithApp = uniqueSupply.map(r => ({ 
    ...r, 
    app: 'Aave'
  }));
  const borrowWithApp = uniqueBorrow.map(r => ({ 
    ...r, 
    app: 'Aave'
  }));
  
  const data = {
    topSupply: supplyWithApp,
    topBorrow: borrowWithApp,
    lastSync,
    generatedAt: new Date().toISOString(),
    source: 'sqlite'
  };
  
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.log('✅ data.json generated with', uniqueSupply.length, 'unique reserves');
  db.close();
}).catch(err => {
  console.error('❌ Error:', err.message);
  db.close();
  process.exit(1);
});
