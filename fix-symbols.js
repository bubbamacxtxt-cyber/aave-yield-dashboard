const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('aave.db');

// Add missing tokens with proper symbols
db.serialize(() => {
  // Celo USD₮ -> USDT
  db.run(`UPDATE reserves SET symbol = 'USDT' WHERE symbol = 'USD₮'`, function(err) {
    if (err) console.error('Error updating Celo USDT:', err);
    else console.log(`✅ Updated ${this.changes} Celo USDT entries`);
  });
  
  // Arbitrum USD₮0 -> USDT0
  db.run(`UPDATE reserves SET symbol = 'USDT0' WHERE symbol = 'USD₮0'`, function(err) {
    if (err) console.error('Error updating Arbitrum USDT0:', err);
    else console.log(`✅ Updated ${this.changes} Arbitrum USDT0 entries`);
  });
  
  console.log('Done!');
  setTimeout(() => db.close(), 500);
});
