const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('aave.db');

// Token address mappings for .e variants (bridged tokens)
const bridgedTokens = {
  // Optimism
  '0x7F5c764cBc14f9669B88837ca1490cCa17c31607': 'USDC.e',  // Bridged USDC
  // Arbitrum  
  '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8': 'USDC.e',  // Bridged USDC
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1': 'DAI.e',   // Bridged DAI
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 'USDT.e',  // Bridged USDT
  // Avalanche
  '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664': 'USDC.e',  // Bridged USDC
  '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70': 'DAI.e',   // Bridged DAI
  '0xc7198437980c041c805A1EDcbA50c1Ce5db95118': 'USDT.e',  // Bridged USDT
  '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E': 'USDC',    // Native USDC (not .e)
};

// Update token symbols for bridged versions
db.serialize(() => {
  console.log('Updating bridged token symbols...');
  
  Object.entries(bridgedTokens).forEach(([address, newSymbol]) => {
    db.run(`
      UPDATE reserves 
      SET symbol = ? 
      WHERE underlying_asset = ? COLLATE NOCASE
    `, [newSymbol, address], function(err) {
      if (err) console.error(`Error updating ${address}:`, err.message);
      else if (this.changes > 0) console.log(`  Updated ${address} to ${newSymbol}`);
    });
  });
  
  console.log('Done!');
  setTimeout(() => db.close(), 1000);
});
